import asyncio
import websockets
import json
import logging
import warnings
from aiohttp import web, web_ws
from aiohttp.web import middleware
import aiohttp_cors
from s2s_session_manager import S2sSessionManager
from device_manager import DeviceManager
from auth_manager import AuthManager
from database import db_manager
import argparse
import os
from integration.strands_agent import StrandsAgent
from integration.universal_mcp_client import UniversalMcpManager

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

# 全局变量
device_manager = DeviceManager()
auth_manager = AuthManager()
MCP_CLIENT = None
STRANDS_AGENT = None
# 每个设备独立的MCP管理器
DEVICE_MCP_MANAGERS = {}

# 移除不需要的WebSocket连接管理

@middleware
async def cors_handler(request, handler):
    """CORS中间件"""
    if request.method == 'OPTIONS':
        response = web.Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Max-Age'] = '86400'
        return response
    else:
        try:
            response = await handler(request)
        except Exception as e:
            logger.error(f"Handler error: {e}")
            response = web.json_response({"error": "Internal server error"}, status=500)
    
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

async def websocket_handler(websocket):
    """WebSocket处理器 - 支持设备连接和认证"""
    device_id = None
    stream_manager = None
    authenticated = False
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                # 处理认证
                if 'auth' in data and not authenticated:
                    username = data['auth'].get('username')
                    password = data['auth'].get('password')
                    device_id = data['auth'].get('device_id')
                    
                    user = await auth_manager.authenticate_user(username, password)
                    if user:
                        token = auth_manager.create_session(user, device_id)
                        authenticated = True
                        
                        # 注册设备
                        device_name = data['auth'].get('device_name', '')
                        device_config = await device_manager.register_device(device_id, device_name)
                        logger.info(f"Device {device_id} authenticated and connected")
                        
                        await websocket.send(json.dumps({
                            "type": "auth_success",
                            "token": token,
                            "device_id": device_id,
                            "config": device_config
                        }))
                    else:
                        await websocket.send(json.dumps({
                            "type": "auth_failed",
                            "error": "Invalid credentials"
                        }))
                    continue
                
                # 处理设备端用户管理
                if 'user_action' in data:
                    action = data['user_action'].get('action')
                    
                    if action == 'register':
                        username = data['user_action'].get('username')
                        password = data['user_action'].get('password')
                        
                        if username and password:
                            success = await auth_manager.create_user(username, password, 'device_user')
                            if success:
                                message = "User created successfully"
                            elif len(password) < 6:
                                message = "Password must be at least 6 characters"
                            else:
                                message = "Username already exists or invalid input"
                            
                            await websocket.send(json.dumps({
                                "type": "user_register_result",
                                "success": success,
                                "message": message
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "user_register_result",
                                "success": False,
                                "message": "Username and password required"
                            }))
                    
                    elif action == 'change_password':
                        username = data['user_action'].get('username')
                        old_password = data['user_action'].get('old_password')
                        new_password = data['user_action'].get('new_password')
                        
                        if username and old_password and new_password:
                            success = await auth_manager.change_password(username, old_password, new_password)
                            await websocket.send(json.dumps({
                                "type": "password_change_result",
                                "success": success,
                                "message": "Password changed successfully" if success else "Invalid credentials or user not found"
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "password_change_result",
                                "success": False,
                                "message": "Username, old password and new password required"
                            }))
                    
                    continue
                
                # 处理设备注册（向后兼容）
                if 'device_id' in data and not authenticated:
                    device_id = data['device_id']
                    device_name = data.get('device_name', '')
                    device_config = await device_manager.register_device(device_id, device_name)
                    authenticated = True  # 临时兼容
                    logger.info(f"Device {device_id} connected (legacy mode)")
                    
                    await websocket.send(json.dumps({
                        "type": "device_registered",
                        "device_id": device_id,
                        "config": device_config
                    }))
                    continue
                
                # 处理S2S事件
                if 'event' in data:
                    if not authenticated or not device_id:
                        await websocket.send(json.dumps({
                            "error": "Device not authenticated"
                        }))
                        continue
                    
                    # 获取设备配置
                    device_config = await device_manager.get_device_config(device_id)
                    if not device_config:
                        continue
                    
                    # 初始化会话管理器
                    if stream_manager is None:
                        aws_region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
                        
                        # 为设备创建独立的MCP管理器
                        if device_id not in DEVICE_MCP_MANAGERS:
                            DEVICE_MCP_MANAGERS[device_id] = UniversalMcpManager()
                        
                        # 加载设备的MCP服务器
                        await DEVICE_MCP_MANAGERS[device_id].load_servers_for_device(device_config)
                        
                        stream_manager = S2sSessionManager(
                            model_id='amazon.nova-sonic-v1:0',
                            region=aws_region,
                            mcp_client=MCP_CLIENT if device_config.get('enable_mcp') else None,
                            strands_agent=STRANDS_AGENT if device_config.get('enable_strands') else None,
                            universal_mcp_manager=DEVICE_MCP_MANAGERS.get(device_id)
                        )
                        
                        await stream_manager.initialize_stream()
                        device_manager.set_device_session(device_id, stream_manager)
                        
                        # 恢复历史记录到新会话
                        chat_history = device_config.get('chat_history', [])
                        if chat_history:
                            logger.info(f"Restoring {len(chat_history)} chat history items for device {device_id}")
                            # TODO: 实现历史记录恢复逻辑
                        
                        # 启动响应转发任务
                        forward_task = asyncio.create_task(
                            forward_responses(websocket, stream_manager, device_id)
                        )
                    
                    # 处理事件
                    event_type = list(data['event'].keys())[0]
                    
                    # 应用设备配置到事件
                    if event_type == 'sessionStart':
                        data['event']['sessionStart']['inferenceConfiguration'] = {
                            'maxTokens': device_config.get('max_tokens', 1024),
                            'topP': device_config.get('top_p', 0.95),
                            'temperature': device_config.get('temperature', 0.7)
                        }
                    
                    elif event_type == 'promptStart':
                        # 应用语音配置
                        if 'audioOutputConfiguration' in data['event']['promptStart']:
                            data['event']['promptStart']['audioOutputConfiguration']['voiceId'] = device_config.get('voice_id', 'matthew')
                        
                        # 应用工具配置
                        data['event']['promptStart']['toolConfiguration'] = device_manager.build_tool_config(device_config)
                    
                    elif event_type == 'textInput' and data['event']['textInput'].get('content') == 'SYSTEM_PROMPT':
                        # 替换系统提示词
                        data['event']['textInput']['content'] = device_config.get('system_prompt', 'You are a friendly assistant.')
                    
                    # 发送到S2S
                    if event_type == 'audioInput':
                        prompt_name = data['event']['audioInput']['promptName']
                        content_name = data['event']['audioInput']['contentName']
                        audio_base64 = data['event']['audioInput']['content']
                        stream_manager.add_audio_chunk(prompt_name, content_name, audio_base64)
                    else:
                        await stream_manager.send_raw_event(data)
                        
            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Device {device_id} disconnected")
    finally:
        if device_id:
            await device_manager.unregister_device(device_id)
            # 清理设备的MCP管理器
            if device_id in DEVICE_MCP_MANAGERS:
                await DEVICE_MCP_MANAGERS[device_id].cleanup_all()
                del DEVICE_MCP_MANAGERS[device_id]
        if stream_manager:
            await stream_manager.close()
        if 'forward_task' in locals():
            forward_task.cancel()

async def forward_responses(websocket, stream_manager, device_id):
    """转发响应到设备"""
    try:
        while True:
            response = await stream_manager.output_queue.get()
            response['device_id'] = device_id
            await websocket.send(json.dumps(response))
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error forwarding responses: {e}")

# HTTP API 处理器
def require_auth(handler):
    """认证装饰器"""
    async def wrapper(request):
        try:
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return web.json_response({"error": "Authentication required"}, status=401)
            
            token = auth_header[7:]
            session = await auth_manager.validate_session_with_user_check(token)
            if not session:
                return web.json_response({"error": "Invalid token"}, status=401)
            
            request['user'] = session['user']
            return await handler(request)
        except Exception as e:
            logger.error(f"Authentication error: {type(e).__name__}")
            return web.json_response({"error": "Authentication failed"}, status=500)
    return wrapper

async def login(request):
    """管理端登录"""
    try:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"success": False, "error": "Invalid JSON"}, status=400)
        
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return web.json_response({"success": False, "error": "Username and password required"}, status=400)
        
        logger.info(f"Login attempt for user: {username}")
        user = await auth_manager.authenticate_user(username, password)
        if user:
            token = auth_manager.create_session(user)
            logger.info(f"Login successful for user: {username}")
            return web.json_response({
                "success": True,
                "token": token,
                "user": {
                    "username": user.username,
                    "role": user.role
                }
            })
        
        logger.warning(f"Login failed for user: {username}")
        return web.json_response({"success": False, "error": "Invalid credentials"}, status=401)
    
    except Exception as e:
        logger.error(f"Login error: {e}")
        return web.json_response({"success": False, "error": "Server error"}, status=500)

@require_auth
async def create_user(request):
    """创建新用户"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'device_user')
    
    if not username or not password:
        return web.json_response({"error": "Username and password required"}, status=400)
    
    if len(password) < 6:
        return web.json_response({"error": "Password must be at least 6 characters"}, status=400)
    
    success = await auth_manager.create_user(username, password, role)
    if success:
        return web.json_response({"success": True, "message": "User created successfully"})
    else:
        return web.json_response({"error": "Username already exists"}, status=400)

@require_auth
async def change_password(request):
    """修改密码"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    
    username = data.get('username')
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    
    if not all([username, old_password, new_password]):
        return web.json_response({"error": "All fields required"}, status=400)
    
    success = await auth_manager.change_password(username, old_password, new_password)
    if success:
        return web.json_response({"success": True, "message": "Password changed successfully"})
    else:
        return web.json_response({"error": "Invalid credentials"}, status=400)

@require_auth
async def get_users(request):
    """获取用户列表（仅管理员）"""
    try:
        user = request['user']
        if user.role != 'admin':
            return web.json_response({"error": "Admin access required"}, status=403)
        
        # 清理过期会话
        try:
            expired_count = auth_manager.cleanup_expired_sessions()
            if expired_count > 0:
                logger.info(f"Cleaned up {expired_count} expired sessions")
        except Exception as cleanup_error:
            logger.warning(f"Failed to cleanup expired sessions: {cleanup_error}")
        
        users = await db_manager.get_all_users()
        return web.json_response(users)
    except Exception as e:
        logger.error(f"Error getting users: {e}")
        error_message = str(e)
        
        # 根据错误类型返回不同的HTTP状态码
        if any(keyword in error_message for keyword in ["无法连接到数据库", "数据库连接失败"]):
            return web.json_response({"error": error_message}, status=503)
        elif "数据库不存在" in error_message or "认证失败" in error_message:
            return web.json_response({"error": error_message}, status=502)
        else:
            return web.json_response({"error": error_message}, status=500)

async def get_devices(request):
    """获取所有设备"""
    try:
        devices = await device_manager.get_all_devices()
        return web.json_response(devices)
    except Exception as e:
        logger.error(f"Error getting devices: {e}")
        return web.json_response({"error": f"Database error: {str(e)}"}, status=500)

async def get_device_config(request):
    """获取设备配置"""
    device_id = request.match_info['device_id']
    config = await device_manager.get_device_config(device_id)
    if not config:
        return web.json_response({"error": "Device not found"}, status=404)
    return web.json_response(config)

async def update_device_config(request):
    """更新设备配置"""
    device_id = request.match_info['device_id']
    data = await request.json()
    
    success = await device_manager.update_device_config(device_id, data)
    if not success:
        return web.json_response({"error": "Device not found"}, status=404)
    
    # 检查是否需要重启会话的配置项
    restart_triggers = ['system_prompt', 'voice_id', 'enable_mcp', 'mcp_servers', 'enable_strands', 'enable_kb', 'enable_agents']
    should_restart = any(key in data for key in restart_triggers)
    
    if should_restart:
        # 如果MCP配置发生变化，重新加载MCP服务器
        if 'mcp_servers' in data or 'enable_mcp' in data:
            updated_config = await device_manager.get_device_config(device_id)
            if updated_config and device_id in DEVICE_MCP_MANAGERS:
                await DEVICE_MCP_MANAGERS[device_id].load_servers_for_device(updated_config)
                logger.info(f"MCP servers reloaded for device {device_id}")
        
        # 断开与Sonic的S2S会话，保持WebSocket连接
        session = device_manager.get_device_session(device_id)
        if session:
            await session.close()
            device_manager.set_device_session(device_id, None)
            logger.info(f"S2S session restarted for device {device_id} due to configuration change: {list(data.keys())}")
    
    return web.json_response({"success": True, "session_restarted": should_restart})

async def device_action(request):
    """设备操作（重启会话等）"""
    device_id = request.match_info['device_id']
    data = await request.json()
    action = data.get('action')
    
    if action == 'restart_session':
        session = device_manager.get_device_session(device_id)
        if session:
            await session.close()
            device_manager.set_device_session(device_id, None)
            logger.info(f"Session manually restarted for device {device_id}")
        return web.json_response({"success": True})
    
    return web.json_response({"error": "Unknown action"}, status=400)

async def get_mcp_servers(request):
    """获取所有MCP服务器配置"""
    servers = await db_manager.get_all_mcp_servers()
    return web.json_response(servers)

async def create_mcp_server(request):
    """创建MCP服务器配置"""
    data = await request.json()
    server_id = await db_manager.create_mcp_server(data)
    return web.json_response({"success": True, "server_id": server_id})

async def update_mcp_server(request):
    """更新MCP服务器配置"""
    server_id = int(request.match_info['server_id'])
    data = await request.json()
    success = await db_manager.update_mcp_server(server_id, data)
    return web.json_response({"success": success})

async def delete_mcp_server(request):
    """删除MCP服务器配置"""
    server_id = int(request.match_info['server_id'])
    success = await db_manager.delete_mcp_server(server_id)
    return web.json_response({"success": success})

@require_auth
async def delete_user(request):
    """删除用户（仅管理员）"""
    try:
        user = request['user']
        if user.role != 'admin':
            return web.json_response({"error": "Admin access required"}, status=403)
        
        username = request.match_info['username']
        if not username or len(username.strip()) == 0:
            return web.json_response({"error": "Username is required"}, status=400)
        
        success = await auth_manager.delete_user_with_cleanup(username)
        
        if success:
            return web.json_response({"success": True, "message": "User deleted successfully"})
        else:
            return web.json_response({"error": "Cannot delete admin user or user not found"}, status=400)
    except Exception as e:
        logger.error(f"Error deleting user: {type(e).__name__}")
        return web.json_response({"error": "Internal server error"}, status=500)

async def health_check(request):
    """健康检查端点"""
    return web.json_response({"status": "healthy", "service": "nova-sonic-server"})

async def init_app():
    """初始化Web应用"""
    app = web.Application(middlewares=[cors_handler])
    
    # 健康检查
    app.router.add_get('/health', health_check)
    
    # API路由
    app.router.add_post('/api/auth/login', login)
    app.router.add_post('/api/auth/register', create_user)
    app.router.add_post('/api/auth/change-password', change_password)
    app.router.add_get('/api/users', get_users)
    app.router.add_get('/api/devices', get_devices)
    app.router.add_get('/api/devices/{device_id}', get_device_config)
    app.router.add_put('/api/devices/{device_id}', update_device_config)
    app.router.add_post('/api/devices/{device_id}/action', device_action)
    
    # MCP服务器管理API
    app.router.add_get('/api/mcp-servers', get_mcp_servers)
    app.router.add_post('/api/mcp-servers', create_mcp_server)
    app.router.add_put('/api/mcp-servers/{server_id}', update_mcp_server)
    app.router.add_delete('/api/mcp-servers/{server_id}', delete_mcp_server)
    app.router.add_delete('/api/users/{username}', delete_user)
    
    # 移除WebSocket路由，使用独立的websockets服务器
    # app.router.add_get('/ws', websocket_handler)
    
    return app

async def main(host, port, http_port, enable_mcp=False, enable_strands=False):
    """主函数"""
    global MCP_CLIENT, STRANDS_AGENT
    
    # 初始化数据库
    await db_manager.initialize()
    
    # 初始化集成服务
    if enable_mcp:
        try:
            # MCP_CLIENT = McpLocationClient()  # 使用 UNIVERSAL_MCP_MANAGER 代替
            # await MCP_CLIENT.connect_to_server()
            logger.info("MCP integration enabled (using universal manager)")
        except Exception as e:
            logger.error(f"Failed to initialize MCP: {e}")
    
    if enable_strands:
        try:
            STRANDS_AGENT = StrandsAgent()
            logger.info("Strands agent initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Strands: {e}")
    
    # 启动HTTP API服务器（包含WebSocket路由）
    if http_port:
        app = await init_app()
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, host, http_port)
        await site.start()
        logger.info(f"HTTP API server started at {host}:{http_port}")
    
    # 启动独立的WebSocket服务器
    async with websockets.serve(websocket_handler, host, port):
        logger.info(f"WebSocket server started at {host}:{port}")
        
        # 保持服务运行
        await asyncio.Future()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Enhanced Nova S2S Server')
    parser.add_argument('--agent', type=str, help='Agent integration "mcp" or "strands"')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()
    
    host = os.getenv("PYTHON_HOST", os.getenv("HOST", "localhost"))
    ws_port = int(os.getenv("PYTHON_WS_PORT", os.getenv("WS_PORT", "8081")))
    http_port = int(os.getenv("PYTHON_HTTP_PORT", os.getenv("HTTP_PORT", "8080")))
    
    enable_mcp = args.agent == "mcp"
    enable_strands = args.agent == "strands"
    
    try:
        asyncio.run(main(host, ws_port, http_port, enable_mcp, enable_strands))
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
import os
import asyncio
import asyncpg
import json
import logging
from typing import Optional, Dict, List
from datetime import datetime

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self):
        self.pool = None
        self.db_url = self._build_db_url()
    
    def _build_db_url(self) -> str:
        """构建数据库连接URL"""
        host = os.getenv('DB_HOST', 'localhost')
        port = os.getenv('DB_PORT', '5432')
        database = os.getenv('DB_NAME', 'nova_sonic')
        user = os.getenv('DB_USER', 'postgres')
        password = os.getenv('DB_PASSWORD', 'password')
        
        return f"postgresql://{user}:{password}@{host}:{port}/{database}"
    
    async def initialize(self):
        """初始化数据库连接池"""
        try:
            # 添加连接参数
            self.pool = await asyncpg.create_pool(
                self.db_url,
                min_size=3,
                max_size=15,
                command_timeout=60,
                server_settings={
                    'application_name': 'nova_sonic_server',
                },
                ssl='require' if 'rds.amazonaws.com' in self.db_url else None,
                timeout=15,  # 连接超时15秒
                max_inactive_connection_lifetime=300  # 5分钟后关闭非活跃连接
            )
            await self.create_tables()
            await self.create_default_users()
            logger.info("Database initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    async def create_tables(self):
        """创建数据库表"""
        async with self.pool.acquire() as conn:
            # 用户表
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(20) DEFAULT 'device_user',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP
                )
            ''')
            
            # 设备表
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS devices (
                    id SERIAL PRIMARY KEY,
                    device_id VARCHAR(100) UNIQUE NOT NULL,
                    user_id INTEGER REFERENCES users(id),
                    device_name VARCHAR(100),
                    device_type VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'offline',
                    last_seen TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 设备配置表
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS device_configs (
                    id SERIAL PRIMARY KEY,
                    device_id VARCHAR(100) REFERENCES devices(device_id),
                    voice_id VARCHAR(50) DEFAULT 'matthew',
                    system_prompt TEXT DEFAULT 'You are a friendly assistant.',
                    max_tokens INTEGER DEFAULT 1024,
                    temperature FLOAT DEFAULT 0.7,
                    top_p FLOAT DEFAULT 0.95,
                    enable_mcp BOOLEAN DEFAULT FALSE,
                    enable_strands BOOLEAN DEFAULT FALSE,
                    enable_kb BOOLEAN DEFAULT FALSE,
                    enable_agents BOOLEAN DEFAULT FALSE,
                    kb_id VARCHAR(100),
                    lambda_arn VARCHAR(255),
                    mcp_servers JSONB DEFAULT '[]',
                    chat_history JSONB DEFAULT '[]',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # MCP服务器配置表
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS mcp_servers (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    connection_type VARCHAR(20) NOT NULL DEFAULT 'stdio',
                    command VARCHAR(255),
                    args JSONB DEFAULT '[]',
                    env_vars JSONB DEFAULT '{}',
                    url VARCHAR(500),
                    headers JSONB DEFAULT '{}',
                    description TEXT,
                    tool_name VARCHAR(100),
                    tool_description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 会话记录表
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id SERIAL PRIMARY KEY,
                    device_id VARCHAR(100) REFERENCES devices(device_id),
                    session_id VARCHAR(100),
                    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_time TIMESTAMP,
                    token_usage INTEGER DEFAULT 0,
                    message_count INTEGER DEFAULT 0
                )
            ''')
    
    async def create_default_users(self):
        """创建默认用户"""
        import bcrypt
        
        async with self.pool.acquire() as conn:
            # 检查是否已存在默认用户
            admin_exists = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE username = 'admin'"
            )
            
            if admin_exists == 0:
                # 使用环境变量或默认密码
                admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')
                device_password = os.getenv('DEVICE_PASSWORD', 'device123')
                
                admin_hash = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                await conn.execute(
                    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
                    "admin", admin_hash, "admin"
                )
                
                device_hash = bcrypt.hashpw(device_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                await conn.execute(
                    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
                    "device", device_hash, "device_user"
                )
                
                logger.info("Default users created with bcrypt hashing")
    
    async def close(self):
        """关闭数据库连接池"""
        if self.pool:
            await self.pool.close()
    
    # 用户相关操作
    async def get_user(self, username: str) -> Optional[Dict]:
        """获取用户信息"""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users WHERE username = $1", username
            )
            return dict(row) if row else None
    
    async def create_user(self, username: str, password_hash: str, role: str) -> bool:
        """创建新用户"""
        async with self.pool.acquire() as conn:
            try:
                await conn.execute(
                    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
                    username, password_hash, role
                )
                return True
            except asyncpg.UniqueViolationError:
                return False
    
    async def update_user_password(self, username: str, password_hash: str) -> bool:
        """更新用户密码"""
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE users SET password_hash = $1 WHERE username = $2",
                password_hash, username
            )
            return result != "UPDATE 0"
    
    async def update_user_login(self, username: str):
        """更新用户最后登录时间"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = $1",
                username
            )
    
    async def get_all_users(self) -> List[Dict]:
        """获取所有用户（管理端使用）"""
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                if not self.pool:
                    logger.error("Database pool not initialized")
                    raise Exception("Database not connected")
                
                async with self.pool.acquire(timeout=10) as conn:
                    # 添加连接测试
                    await conn.execute("SELECT 1")
                    
                    rows = await conn.fetch(
                        "SELECT username, role, created_at, last_login FROM users ORDER BY role ASC, created_at DESC",
                        timeout=30
                    )
                    
                    if rows is None:
                        logger.warning("Database query returned None")
                        return []
                    
                    users = []
                    for row in rows:
                        user_dict = dict(row)
                        # 转换datetime对象为字符串
                        if user_dict.get('created_at'):
                            user_dict['created_at'] = user_dict['created_at'].isoformat()
                        if user_dict.get('last_login'):
                            user_dict['last_login'] = user_dict['last_login'].isoformat()
                        users.append(user_dict)
                    
                    logger.info(f"Retrieved {len(users)} users from database")
                    return users
                    
            except (asyncpg.ConnectionDoesNotExistError, asyncpg.InterfaceError, OSError) as e:
                retry_count += 1
                logger.warning(f"Database connection error (attempt {retry_count}/{max_retries}): {e}")
                if retry_count >= max_retries:
                    logger.error(f"Failed to get users after {max_retries} attempts")
                    raise Exception("数据库连接失败，请稍后重试")
                await asyncio.sleep(1)  # 等待1秒后重试
            except Exception as e:
                logger.error(f"Error in get_all_users: {e}")
                raise
    
    # 设备相关操作
    async def register_device(self, device_id: str, device_name: str, user_id: int = None) -> Dict:
        """注册设备"""
        async with self.pool.acquire() as conn:
            # 插入或更新设备
            await conn.execute('''
                INSERT INTO devices (device_id, device_name, user_id, status, last_seen)
                VALUES ($1, $2, $3, 'online', CURRENT_TIMESTAMP)
                ON CONFLICT (device_id) 
                DO UPDATE SET 
                    device_name = EXCLUDED.device_name,
                    status = 'online',
                    last_seen = CURRENT_TIMESTAMP
            ''', device_id, device_name, user_id)
            
            # 插入默认配置
            await conn.execute('''
                INSERT INTO device_configs (device_id)
                VALUES ($1)
                ON CONFLICT (device_id) DO NOTHING
            ''', device_id)
            
            return await self.get_device_config(device_id)
    
    async def unregister_device(self, device_id: str):
        """设备下线"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE devices SET status = 'offline', last_seen = CURRENT_TIMESTAMP WHERE device_id = $1",
                device_id
            )
    
    async def get_device_config(self, device_id: str) -> Optional[Dict]:
        """获取设备配置"""
        try:
            if not self.pool:
                logger.error("Database pool not initialized")
                raise Exception("Database not connected")
            
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow('''
                    SELECT d.*, c.* FROM devices d
                    LEFT JOIN device_configs c ON d.device_id = c.device_id
                    WHERE d.device_id = $1
                ''', device_id)
                
                if row:
                    config = dict(row)
                    config['is_online'] = config['status'] == 'online'
                    
                    # 转换datetime对象为字符串
                    for key, value in config.items():
                        if hasattr(value, 'isoformat'):  # datetime对象
                            config[key] = value.isoformat()
                    
                    return config
                return None
        except Exception as e:
            logger.error(f"Error in get_device_config for device {device_id}: {e}")
            raise
    
    async def update_device_config(self, device_id: str, config_data: Dict) -> bool:
        """更新设备配置"""
        async with self.pool.acquire() as conn:
            # 构建更新字段
            fields = []
            values = []
            param_count = 1
            
            for key, value in config_data.items():
                if key in ['voice_id', 'system_prompt', 'max_tokens', 'temperature', 'top_p',
                          'enable_mcp', 'enable_strands', 'enable_kb', 'enable_agents',
                          'kb_id', 'lambda_arn', 'mcp_servers', 'chat_history']:
                    fields.append(f"{key} = ${param_count}")
                    values.append(value)
                    param_count += 1
            
            if fields:
                fields.append(f"updated_at = CURRENT_TIMESTAMP")
                query = f"UPDATE device_configs SET {', '.join(fields)} WHERE device_id = ${param_count}"
                values.append(device_id)
                
                result = await conn.execute(query, *values)
                return result != "UPDATE 0"
            
            return False
    
    async def get_all_devices(self) -> Dict[str, Dict]:
        """获取所有设备"""
        try:
            if not self.pool:
                logger.error("Database pool not initialized")
                raise Exception("Database not connected")
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch('''
                    SELECT d.*, c.* FROM devices d
                    LEFT JOIN device_configs c ON d.device_id = c.device_id
                    ORDER BY d.created_at DESC
                ''')
                
                devices = {}
                for row in rows:
                    device = dict(row)
                    device['is_online'] = device['status'] == 'online'
                    
                    # 转换datetime对象为字符串
                    for key, value in device.items():
                        if hasattr(value, 'isoformat'):  # datetime对象
                            device[key] = value.isoformat()
                    
                    devices[device['device_id']] = device
                
                logger.info(f"Retrieved {len(devices)} devices from database")
                return devices
        except Exception as e:
            logger.error(f"Error in get_all_devices: {e}")
            raise
    
    # 会话相关操作
    async def create_session(self, device_id: str, session_id: str):
        """创建会话记录"""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO sessions (device_id, session_id) VALUES ($1, $2)",
                device_id, session_id
            )
    
    async def update_session_stats(self, session_id: str, token_usage: int, message_count: int):
        """更新会话统计"""
        async with self.pool.acquire() as conn:
            await conn.execute('''
                UPDATE sessions 
                SET token_usage = $1, message_count = $2, end_time = CURRENT_TIMESTAMP
                WHERE session_id = $3
            ''', token_usage, message_count, session_id)
    
    # MCP服务器管理操作
    async def get_all_mcp_servers(self) -> List[Dict]:
        """获取所有MCP服务器配置"""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM mcp_servers ORDER BY created_at DESC")
            return [dict(row) for row in rows]
    
    async def create_mcp_server(self, server_data: Dict) -> int:
        """创建MCP服务器配置"""
        async with self.pool.acquire() as conn:
            server_id = await conn.fetchval('''
                INSERT INTO mcp_servers (name, connection_type, command, args, env_vars, url, headers, description, tool_name, tool_description)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            ''', 
                server_data['name'],
                server_data.get('connection_type', 'stdio'),
                server_data.get('command', ''),
                json.dumps(server_data.get('args', [])),
                json.dumps(server_data.get('env_vars', {})),
                server_data.get('url', ''),
                json.dumps(server_data.get('headers', {})),
                server_data.get('description', ''),
                server_data.get('tool_name', ''),
                server_data.get('tool_description', '')
            )
            return server_id
    
    async def update_mcp_server(self, server_id: int, server_data: Dict) -> bool:
        """更新MCP服务器配置"""
        async with self.pool.acquire() as conn:
            result = await conn.execute('''
                UPDATE mcp_servers 
                SET name = $1, connection_type = $2, command = $3, args = $4, env_vars = $5, 
                    url = $6, headers = $7, description = $8, tool_name = $9, tool_description = $10
                WHERE id = $11
            ''',
                server_data['name'],
                server_data.get('connection_type', 'stdio'),
                server_data.get('command', ''),
                json.dumps(server_data.get('args', [])),
                json.dumps(server_data.get('env_vars', {})),
                server_data.get('url', ''),
                json.dumps(server_data.get('headers', {})),
                server_data.get('description', ''),
                server_data.get('tool_name', ''),
                server_data.get('tool_description', ''),
                server_id
            )
            return result != "UPDATE 0"
    
    async def delete_mcp_server(self, server_id: int) -> bool:
        """删除MCP服务器配置"""
        async with self.pool.acquire() as conn:
            result = await conn.execute("DELETE FROM mcp_servers WHERE id = $1", server_id)
            return result != "DELETE 0"
    
    async def delete_user(self, username: str) -> bool:
        """删除用户"""
        async with self.pool.acquire() as conn:
            if username == 'admin':
                return False
            result = await conn.execute("DELETE FROM users WHERE username = $1", username)
            return result != "DELETE 0"
    
    async def delete_user_with_cascade(self, username: str) -> bool:
        """删除用户及其关联数据"""
        if username == 'admin':
            return False
        
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                try:
                    user_id = await conn.fetchval("SELECT id FROM users WHERE username = $1", username)
                    if not user_id:
                        return False
                    
                    # 删除关联的设备配置
                    await conn.execute("DELETE FROM device_configs WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = $1)", user_id)
                    
                    # 删除关联的会话
                    await conn.execute("DELETE FROM sessions WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = $1)", user_id)
                    
                    # 删除关联的设备
                    await conn.execute("DELETE FROM devices WHERE user_id = $1", user_id)
                    
                    # 最后删除用户
                    result = await conn.execute("DELETE FROM users WHERE id = $1", user_id)
                    
                    return result != "DELETE 0"
                except Exception as e:
                    logger.error(f"Error in cascade delete: {type(e).__name__}")
                    raise

# 全局数据库管理器实例
db_manager = DatabaseManager()
import asyncio
import websockets
import json
import uuid
import base64
import logging
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class HardwareDeviceClient:
    """硬件设备客户端"""
    
    def __init__(self, server_url: str, username: str, password: str, device_id: str = None, device_name: str = ""):
        self.server_url = server_url
        self.username = username
        self.password = password
        self.device_id = device_id or str(uuid.uuid4())
        self.device_name = device_name or f"Hardware-{self.device_id[:8]}"
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.session_active = False
        self.authenticated = False
        self.token = None

        
        # 会话参数
        self.prompt_name = None
        self.audio_content_name = None
        
    async def connect(self):
        """连接到服务器"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            logger.info(f"Connected to server: {self.server_url}")
            
            # 认证设备
            await self.authenticate()
            
            # 启动消息监听
            asyncio.create_task(self.listen_messages())
            
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            raise
    
    async def authenticate(self):
        """认证设备"""
        auth_data = {
            "auth": {
                "username": self.username,
                "password": self.password,
                "device_id": self.device_id,
                "device_name": self.device_name
            }
        }
        await self.websocket.send(json.dumps(auth_data))
        logger.info(f"Authentication sent for device: {self.device_id}")
    
    async def register_device(self):
        """注册设备（向后兼容）"""
        registration_data = {
            "device_id": self.device_id,
            "device_name": self.device_name
        }
        await self.websocket.send(json.dumps(registration_data))
        logger.info(f"Device registered: {self.device_id}")
    
    async def register_user(self, username: str, password: str):
        """注册新用户"""
        user_data = {
            "user_action": {
                "action": "register",
                "username": username,
                "password": password
            }
        }
        await self.websocket.send(json.dumps(user_data))
        logger.info(f"User registration request sent: {username}")
    
    async def change_password(self, username: str, old_password: str, new_password: str):
        """修改密码"""
        password_data = {
            "user_action": {
                "action": "change_password",
                "username": username,
                "old_password": old_password,
                "new_password": new_password
            }
        }
        await self.websocket.send(json.dumps(password_data))
        logger.info(f"Password change request sent: {username}")
    
    async def listen_messages(self):
        """监听服务器消息"""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                await self.handle_message(data)
        except websockets.exceptions.ConnectionClosed:
            logger.info("Connection closed")
        except Exception as e:
            logger.error(f"Error listening messages: {e}")
    
    async def handle_message(self, data):
        """处理服务器消息"""
        if data.get("type") == "auth_success":
            self.authenticated = True
            self.token = data.get("token")
            logger.info("Device authentication successful")
            return
        
        if data.get("type") == "auth_failed":
            logger.error(f"Authentication failed: {data.get('error')}")
            return
        
        if data.get("type") == "device_registered":
            self.authenticated = True  # 向后兼容
            logger.info("Device registration confirmed")
            return
        
        if data.get("type") == "user_register_result":
            success = data.get("success")
            message = data.get("message")
            logger.info(f"User registration result: {message}")
            return
        
        if data.get("type") == "password_change_result":
            success = data.get("success")
            message = data.get("message")
            logger.info(f"Password change result: {message}")
            return
        
        if "event" in data:
            event_type = list(data["event"].keys())[0]
            
            if event_type == "audioOutput":
                # 播放音频
                audio_data = data["event"]["audioOutput"]["content"]
                logger.info("Received audio output")
            
            elif event_type == "textOutput":
                # 显示文本
                content = data["event"]["textOutput"]["content"]
                logger.info(f"AI Response: {content}")
    
    async def start_session(self):
        """开始语音会话"""
        if self.session_active or not self.authenticated:
            return
        
        self.prompt_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        text_content_name = str(uuid.uuid4())
        
        # 发送会话开始事件
        await self.send_event({
            "sessionStart": {
                "inferenceConfiguration": {
                    "maxTokens": 1024,
                    "topP": 0.95,
                    "temperature": 0.7
                }
            }
        })
        
        # 发送提示开始事件
        await self.send_event({
            "promptStart": {
                "promptName": self.prompt_name,
                "textOutputConfiguration": {"mediaType": "text/plain"},
                "audioOutputConfiguration": {
                    "mediaType": "audio/lpcm",
                    "sampleRateHertz": 24000,
                    "sampleSizeBits": 16,
                    "channelCount": 1,
                    "voiceId": "matthew",
                    "encoding": "base64",
                    "audioType": "SPEECH"
                },
                "toolUseOutputConfiguration": {"mediaType": "application/json"},
                "toolConfiguration": {"tools": []}
            }
        })
        
        # 发送系统提示词
        await self.send_event({
            "contentStart": {
                "promptName": self.prompt_name,
                "contentName": text_content_name,
                "type": "TEXT",
                "interactive": True,
                "role": "SYSTEM",
                "textInputConfiguration": {"mediaType": "text/plain"}
            }
        })
        
        await self.send_event({
            "textInput": {
                "promptName": self.prompt_name,
                "contentName": text_content_name,
                "content": "SYSTEM_PROMPT"  # 服务器会替换为设备配置的提示词
            }
        })
        
        await self.send_event({
            "contentEnd": {
                "promptName": self.prompt_name,
                "contentName": text_content_name
            }
        })
        
        # 开始音频内容
        await self.send_event({
            "contentStart": {
                "promptName": self.prompt_name,
                "contentName": self.audio_content_name,
                "type": "AUDIO",
                "interactive": True,
                "audioInputConfiguration": {
                    "mediaType": "audio/lpcm",
                    "sampleRateHertz": 16000,
                    "sampleSizeBits": 16,
                    "channelCount": 1,
                    "audioType": "SPEECH",
                    "encoding": "base64"
                }
            }
        })
        
        self.session_active = True
        logger.info("Session started")
    
    async def send_audio_chunk(self, audio_base64: str):
        """发送音频数据"""
        if self.session_active:
            await self.send_event({
                "audioInput": {
                    "promptName": self.prompt_name,
                    "contentName": self.audio_content_name,
                    "content": audio_base64
                }
            })
    
    async def stop_session(self):
        """停止语音会话"""
        if not self.session_active:
            return
        
        # 发送会话结束事件
        await self.send_event({
            "contentEnd": {
                "promptName": self.prompt_name,
                "contentName": self.audio_content_name
            }
        })
        
        await self.send_event({
            "promptEnd": {
                "promptName": self.prompt_name
            }
        })
        
        await self.send_event({
            "sessionEnd": {}
        })
        
        self.session_active = False
        logger.info("Session stopped")
    
    async def send_event(self, event_data):
        """发送事件到服务器"""
        if self.websocket:
            message = {"event": event_data}
            await self.websocket.send(json.dumps(message))
    
    async def disconnect(self):
        """断开连接"""
        if self.session_active:
            await self.stop_session()
        
        if self.websocket:
            await self.websocket.close()
        
        logger.info("Disconnected")

# 使用示例
async def main():
    device = HardwareDeviceClient(
        server_url="ws://localhost:8081",
        username="device",
        password="device123",
        device_name="Smart Speaker 01"
    )
    
    try:
        await device.connect()
        await device.start_session()
        
        # 模拟发送音频数据
        for i in range(10):
            # 这里应该是真实的音频数据
            fake_audio = base64.b64encode(b"fake_audio_data").decode('utf-8')
            await device.send_audio_chunk(fake_audio)
            await asyncio.sleep(1)
        
    except KeyboardInterrupt:
        logger.info("Stopping device...")
    finally:
        await device.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
import asyncio
import json
import uuid
from typing import Dict, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
from database import db_manager

@dataclass
class DeviceConfig:
    """设备配置数据结构"""
    device_id: str
    device_name: str = ""
    voice_id: str = "matthew"
    system_prompt: str = "You are a friendly assistant."
    max_tokens: int = 1024
    temperature: float = 0.7
    top_p: float = 0.95
    
    # 工具配置
    enable_mcp: bool = False
    enable_strands: bool = False
    enable_kb: bool = False
    enable_agents: bool = False
    kb_id: str = ""
    lambda_arn: str = ""
    
    # 聊天历史
    chat_history: list = None
    
    # 状态信息
    is_online: bool = False
    last_seen: str = ""
    created_at: str = ""
    
    def __post_init__(self):
        if self.chat_history is None:
            self.chat_history = []
        if not self.created_at:
            self.created_at = datetime.now().isoformat()

class DeviceManager:
    """设备和配置管理器"""
    
    def __init__(self):
        self.device_sessions: Dict[str, object] = {}  # device_id -> S2sSessionManager
        
    async def register_device(self, device_id: str, device_name: str = "") -> dict:
        """注册新设备"""
        device_name = device_name or f"Device-{device_id[:8]}"
        return await db_manager.register_device(device_id, device_name)
    
    async def unregister_device(self, device_id: str):
        """设备下线"""
        try:
            await db_manager.unregister_device(device_id)
        except Exception:
            pass
        
        if device_id in self.device_sessions:
            del self.device_sessions[device_id]
    
    async def get_device_config(self, device_id: str) -> Optional[dict]:
        """获取设备配置"""
        try:
            return await db_manager.get_device_config(device_id)
        except Exception:
            return None
    
    async def update_device_config(self, device_id: str, config_data: dict) -> bool:
        """更新设备配置"""
        try:
            return await db_manager.update_device_config(device_id, config_data)
        except Exception:
            return False
    
    async def get_all_devices(self) -> Dict[str, dict]:
        """获取所有设备信息"""
        try:
            return await db_manager.get_all_devices()
        except Exception:
            return {}
    
    def set_device_session(self, device_id: str, session):
        """设置设备会话"""
        self.device_sessions[device_id] = session
    
    def get_device_session(self, device_id: str):
        """获取设备会话"""
        return self.device_sessions.get(device_id)
    
    def build_tool_config(self, device_config: dict) -> dict:
        """根据设备配置构建工具配置"""
        tools = []
        
        # 基础工具
        tools.append({
            "toolSpec": {
                "name": "getDateTool",
                "description": "get information about the current day",
                "inputSchema": {
                    "json": '{"type": "object", "properties": {}, "required": []}'
                }
            }
        })
        
        # 知识库工具
        if device_config.get('enable_kb') and device_config.get('kb_id'):
            tools.append({
                "toolSpec": {
                    "name": "getKbTool",
                    "description": "get information from knowledge base",
                    "inputSchema": {
                        "json": '{"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}'
                    }
                }
            })
        
        # 动态MCP工具
        mcp_servers = device_config.get('mcp_servers', [])
        for server in mcp_servers:
            if server.get('tool_name'):
                tools.append({
                    "toolSpec": {
                        "name": server['tool_name'],
                        "description": server.get('tool_description', server['name']),
                        "inputSchema": {
                            "json": '{"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}'
                        }
                    }
                })
        
        # 传统MCP工具（向后兼容）
        if device_config.get('enable_mcp'):
            tools.append({
                "toolSpec": {
                    "name": "getLocationTool",
                    "description": "Search for places and locations",
                    "inputSchema": {
                        "json": '{"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}'
                    }
                }
            })
        
        # Strands Agent工具
        if device_config.get('enable_strands'):
            tools.append({
                "toolSpec": {
                    "name": "externalAgent",
                    "description": "Get weather information",
                    "inputSchema": {
                        "json": '{"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}'
                    }
                }
            })
        
        # Bedrock Agents工具
        if device_config.get('enable_agents') and device_config.get('lambda_arn'):
            tools.append({
                "toolSpec": {
                    "name": "getBookingDetails",
                    "description": "Manage bookings and reservations",
                    "inputSchema": {
                        "json": '{"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}'
                    }
                }
            })
        
        return {"tools": tools}
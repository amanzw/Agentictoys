import asyncio
import json
import aiohttp
from contextlib import AsyncExitStack
from typing import Dict, List, Optional, Any
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client

class UniversalMcpClient:
    def __init__(self, server_config: Dict):
        self.config = server_config
        self.connection_type = server_config.get('connection_type', 'stdio')
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.connected = False

    async def connect(self):
        try:
            if self.connection_type == 'stdio':
                await self._connect_stdio()
            elif self.connection_type == 'sse':
                await self._connect_sse()
            elif self.connection_type == 'http':
                await self._connect_http()
            else:
                raise ValueError(f"Unsupported connection type: {self.connection_type}")
            
            if self.session:
                await self.session.initialize()
                self.connected = True
                
        except Exception as e:
            print(f"Failed to connect to MCP server {self.config['name']}: {e}")
            self.connected = False

    async def _connect_stdio(self):
        env_vars = json.loads(self.config.get('env_vars', '{}'))
        args = json.loads(self.config.get('args', '[]'))
        
        server_params = StdioServerParameters(
            command=self.config['command'],
            args=args,
            env=env_vars
        )
        
        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        stdio, write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(stdio, write)
        )

    async def _connect_sse(self):
        url = self.config.get('url')
        if not url:
            raise ValueError("SSE connection requires URL")
        
        headers = json.loads(self.config.get('headers', '{}'))
        
        sse_transport = await self.exit_stack.enter_async_context(
            sse_client(url, headers=headers)
        )
        read, write = sse_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(read, write)
        )

    async def _connect_http(self):
        url = self.config.get('url')
        if not url:
            raise ValueError("HTTP connection requires URL")
        
        headers = json.loads(self.config.get('headers', '{}'))
        
        http_transport = await self.exit_stack.enter_async_context(
            streamablehttp_client(url, headers=headers)
        )
        read, write = http_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(read, write)
        )

    async def get_tools(self):
        if not self.connected or not self.session:
            return []
        
        try:
            tools_result = await self.session.list_tools()
            return [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.inputSchema,
                    },
                }
                for tool in tools_result.tools
            ]
        except Exception as e:
            print(f"Error getting tools: {e}")
            return []

    async def call_tool(self, tool_name: str, tool_input):
        if not self.connected or not self.session:
            return "MCP server not connected"
        
        try:
            if isinstance(tool_input, str):
                tool_input = json.loads(tool_input)
            
            # 尝试从输入中提取查询参数
            if "query" in tool_input:
                params = {"query": tool_input["query"]}
            else:
                params = tool_input
            
            response = await self.session.call_tool(tool_name, params)
            
            result = []
            for content in response.content:
                if hasattr(content, 'text'):
                    result.append(content.text)
                else:
                    result.append(str(content))
            
            return result if result else "No result"
            
        except Exception as e:
            return f"Error calling MCP tool: {e}"

    async def cleanup(self):
        await self.exit_stack.aclose()
        self.connected = False

class UniversalMcpManager:
    def __init__(self):
        self.clients: Dict[str, UniversalMcpClient] = {}
    
    async def load_servers_for_device(self, device_config: Dict):
        """为设备加载配置的MCP服务器"""
        mcp_servers = device_config.get('mcp_servers', [])
        
        # 清理现有客户端
        await self.cleanup_all()
        
        # 创建新客户端
        for server_config in mcp_servers:
            client = UniversalMcpClient(server_config)
            await client.connect()
            if client.connected:
                self.clients[server_config['name']] = client
                print(f"MCP server '{server_config['name']}' connected successfully")
            else:
                print(f"Failed to connect MCP server '{server_config['name']}'")
    
    async def call_tool(self, server_name: str, tool_name: str, tool_input):
        """调用指定服务器的工具"""
        if server_name in self.clients:
            return await self.clients[server_name].call_tool(tool_name, tool_input)
        return f"MCP server {server_name} not found"
    
    async def reload_servers_for_device(self, device_config: Dict):
        """为设备重新加载配置的MCP服务器（不影响其他设备）"""
        await self.load_servers_for_device(device_config)
    
    async def cleanup_all(self):
        """清理所有客户端"""
        for client in self.clients.values():
            await client.cleanup()
        self.clients.clear()
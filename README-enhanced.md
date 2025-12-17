# Nova Sonic 多设备管理系统

基于原有 Nova Sonic S2S 项目扩展的多设备管理系统，支持多个硬件设备同时接入，提供统一的管理界面和个性化配置。

## 新增功能

### 🔐 用户认证系统
- 设备端用户名密码登录
- 管理端认证和会话管理
- 基于JWT的安全认证
- 设备端用户注册和密码修改
- 管理端用户管理功能

### 📱 多设备支持
- 支持多个设备并发连接
- 设备注册和状态管理
- 独立的设备配置和会话

### ⚙️ 设备配置管理
- 个性化系统提示词
- 语音角色选择
- 工具集成开关（MCP、Strands、RAG KB、Agents）
- 模型参数调整

### 🖥️ 增强管理界面
- 设备列表和状态监控
- 实时配置更新
- 设备会话管理
- 使用统计和监控
- 用户管理界面
- 用户创建和密码修改功能

## 快速开始

### 1. 部署 PostgreSQL 数据库 (AWS RDS)
```bash
# 设置部署参数
export VPC_ID="vpc-12345678"
export SUBNET_IDS="subnet-12345678,subnet-87654321"
export DB_PASSWORD="YourSecurePassword123"

# 部署 RDS
cd deploy
./deploy-rds.sh
```

### 2. 环境准备
```bash
# AWS 凭证
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="us-east-1"

# 数据库配置 (从 RDS 部署输出获取)
export DB_HOST="nova-sonic-db.xxxxx.us-east-1.rds.amazonaws.com"
export DB_PORT=5432
export DB_NAME="nova_sonic"
export DB_USER="postgres"
export DB_PASSWORD="YourSecurePassword123"

# Python Server 配置
export PYTHON_HOST=localhost
export PYTHON_HTTP_PORT=8080
export PYTHON_WS_PORT=8081

# React Management 配置
export REACT_HOST=localhost
export REACT_PORT=3000
export REACT_APP_PYTHON_HOST=localhost
export REACT_APP_PYTHON_HTTP_PORT=8080
export REACT_APP_PYTHON_WS_PORT=8081

# 安全配置
export JWT_SECRET_KEY="your-secure-jwt-secret"

# 用户管理配置
export ALLOW_DEVICE_REGISTRATION=true    # 允许设备端注册新用户
export ALLOW_DEVICE_PASSWORD_CHANGE=true # 允许设备端修改密码
export PASSWORD_MIN_LENGTH=6             # 密码最小长度
```

### 3. 启动系统
```bash
# 使用启动脚本（推荐）
./start-enhanced.sh

# 或手动启动Python服务器
cd python-server
python3.12 enhanced_server.py [OPTIONS]

# 启动React管理界面
cd ../react-management
npm install && npm start
```

#### Python Server 启动参数
```bash
# 基础启动
python3.12 enhanced_server.py

# 启用 Strands Agent 集成（包含AWS Location MCP Server）
python3.12 enhanced_server.py --agent strands

# 启用 MCP 集成（使用Universal MCP Manager）
python3.12 enhanced_server.py --agent mcp

# 启用调试模式
python3.12 enhanced_server.py --debug

# 组合使用
python3.12 enhanced_server.py --agent strands --debug
```

**参数说明：**
- `--agent {mcp|strands}`: 启用特定的Agent集成
  - `mcp`: 启用MCP集成（使用Universal MCP Manager）
  - `strands`: 启用Strands Agent集成（包含AWS Location MCP Server和天气服务）
- `--debug`: 启用调试模式，输出更详细的日志信息

**注意：**
- 使用 `--agent strands` 时，locationMcpTool 会自动可用
- 不指定 `--agent` 参数时，需要通过管理界面手动配置MCP服务器
- 环境变量配置优先级高于命令行参数

### 4. 访问服务
- 管理界面: http://localhost:3000 (可通过 REACT_HOST:REACT_PORT 配置)
- HTTP API: http://localhost:8080 (可通过 PYTHON_HOST:PYTHON_HTTP_PORT 配置)
- WebSocket: ws://localhost:8081 (可通过 PYTHON_HOST:PYTHON_WS_PORT 配置)
- 默认登录: admin / admin123

## 设备接入

### Python客户端示例
```python
from hardware_client.device_client import HardwareDeviceClient

device = HardwareDeviceClient(
    server_url="ws://localhost:8081",  # 使用 PYTHON_HOST:PYTHON_WS_PORT
    username="device",
    password="device123",
    device_name="Smart Speaker 01"
)

await device.connect()
await device.start_session()
```

### 认证协议
```json
{
    "auth": {
        "username": "device",
        "password": "device123",
        "device_id": "device_001",
        "device_name": "Smart Speaker"
    }
}
```

### 用户管理协议（设备端）
```json
// 注册新用户
{
    "user_action": {
        "action": "register",
        "username": "new_user",
        "password": "new_password"
    }
}

// 修改密码
{
    "user_action": {
        "action": "change_password",
        "username": "existing_user",
        "old_password": "old_password",
        "new_password": "new_password"
    }
}
```

## API接口

### 认证API
```
POST /api/auth/login
{
    "username": "admin",
    "password": "admin123"
}

POST /api/auth/register          # 创建新用户
{
    "username": "new_user",
    "password": "password123",
    "role": "device_user"  # 可选，默认为device_user
}

POST /api/auth/change-password   # 修改密码
{
    "username": "user",
    "old_password": "old_pass",
    "new_password": "new_pass"
}

GET /api/users                   # 获取用户列表（仅管理员）
```

### 设备管理API
```
GET /api/devices                    # 获取设备列表
GET /api/devices/{device_id}        # 获取设备配置
PUT /api/devices/{device_id}        # 更新设备配置
POST /api/devices/{device_id}/action # 设备操作
```

## 配置选项

### 设备配置
- **语音角色**: matthew, tiffany, amy等
- **系统提示词**: 个性化AI助手行为
- **模型参数**: max_tokens, temperature, top_p
- **工具集成**: MCP、Strands、Knowledge Base、Bedrock Agents

### 工具集成
- **MCP**: Model Context Protocol位置服务
- **Strands**: 天气查询代理
- **Knowledge Base**: RAG知识库检索
- **Bedrock Agents**: 预订管理系统

## 架构特点

### 🔄 保持兼容性
- 现有WebSocket接口完全不变
- S2S会话管理接口保持不变
- 支持现有集成模式

### 🚀 性能优化
- 异步消息处理
- 内存设备管理
- 按需会话创建
- 工具按配置加载

### 🔒 安全设计
- JWT会话管理
- 设备级别权限隔离
- 配置数据验证
- 连接状态跟踪

## 部署选项

### 开发环境
```bash
# 使用启动脚本（推荐）
./start-enhanced.sh

# 或手动启动
# Python服务器（基础模式）
cd python-server
PYTHON_HOST=localhost PYTHON_HTTP_PORT=8080 PYTHON_WS_PORT=8081 python3.12 enhanced_server.py

# Python服务器（启用Strands Agent）
cd python-server
PYTHON_HOST=localhost PYTHON_HTTP_PORT=8080 PYTHON_WS_PORT=8081 python3.12 enhanced_server.py --agent strands

# Python服务器（启用MCP集成）
cd python-server
PYTHON_HOST=localhost PYTHON_HTTP_PORT=8080 PYTHON_WS_PORT=8081 python3.12 enhanced_server.py --agent mcp

# React管理界面
cd react-management
HOST=localhost PORT=3000 REACT_APP_PYTHON_HOST=localhost npm start
```

### 分离部署示例
```bash
# Python Server 部署在 192.168.1.100
export PYTHON_HOST=192.168.1.100
export PYTHON_HTTP_PORT=8080
export PYTHON_WS_PORT=8081

# React Management 部署在 192.168.1.101
export REACT_HOST=192.168.1.101
export REACT_PORT=3000
export REACT_APP_PYTHON_HOST=192.168.1.100
export REACT_APP_PYTHON_HTTP_PORT=8080
export REACT_APP_PYTHON_WS_PORT=8081
```

### 生产环境
- Docker容器化部署
- Nginx反向代理
- 环境变量配置
- 日志收集监控

## 配置更新机制

**自动会话重启：**
- MCP Server配置修改：自动重启Sonic会话，新配置立即生效
- 语音角色修改：自动重启Sonic会话，新配置立即生效  
- 系统提示词修改：自动重启Sonic会话，新配置立即生效
- WebSocket连接保持不断，设备端无需重新认证

## 故障排除

### 常见问题
1. **认证失败**: 检查用户名密码是否正确
2. **设备连接失败**: 确认WebSocket端口可访问
3. **配置不生效**: 检查设备是否重新连接
4. **工具集成失败**: 验证相关环境变量和权限

### 日志查看
```bash
# Python服务器日志
tail -f python-server/logs/server.log

# 设备连接日志
grep "Device.*connected" python-server/logs/server.log
```

## 扩展开发

### 添加新的工具集成
1. 在`integration/`目录添加新模块
2. 更新`device_manager.py`的工具配置
3. 在React界面添加配置选项

### 自定义认证
1. 扩展`auth_manager.py`
2. 添加新的认证方式
3. 更新前端登录组件

## 环境变量配置

### Python Server 配置
```bash
# 服务地址配置（新变量，优先级高）
PYTHON_HOST=localhost          # Python 服务器主机地址
PYTHON_HTTP_PORT=8080          # HTTP API 端口
PYTHON_WS_PORT=8081            # WebSocket 端口

# 向后兼容（如果新变量未设置则使用）
HOST=localhost                 # 通用主机地址
HTTP_PORT=8080                # HTTP 端口
WS_PORT=8081                  # WebSocket 端口
```

### React Management 配置
```bash
# React 应用服务配置
REACT_HOST=localhost           # React 应用主机地址
REACT_PORT=3000               # React 应用端口

# React 连接 Python Server 配置
REACT_APP_PYTHON_HOST=localhost      # Python 服务器地址
REACT_APP_PYTHON_HTTP_PORT=8080      # Python HTTP API 端口
REACT_APP_PYTHON_WS_PORT=8081        # Python WebSocket 端口

# 或直接指定完整 API URL
REACT_APP_API_URL=http://localhost:8080
```

详细配置说明请参考 [ENV_CONFIG.md](ENV_CONFIG.md)

## 技术栈

- **后端**: Python 3.12+, WebSockets, aiohttp
- **数据库**: PostgreSQL 15.4, AWS RDS
- **前端**: React, Cloudscape Design System
- **认证**: JWT, bcrypt
- **集成**: AWS Bedrock, MCP, Strands

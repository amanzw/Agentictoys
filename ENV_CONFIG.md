# 环境变量配置说明

## Python Server 配置

### 服务地址配置
```bash
# Python Server 服务地址（新变量，优先级高）
export PYTHON_HOST=localhost          # Python 服务器主机地址
export PYTHON_HTTP_PORT=8080          # HTTP API 端口
export PYTHON_WS_PORT=8081            # WebSocket 端口

# 向后兼容的旧变量（如果新变量未设置则使用）
export HOST=localhost                 # 通用主机地址
export HTTP_PORT=8080                # HTTP 端口
export WS_PORT=8081                  # WebSocket 端口
```

### 数据库配置
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=nova_sonic
export DB_USER=postgres
export DB_PASSWORD=your_password
```

### AWS 配置
```bash
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1
```

### 安全配置
```bash
export JWT_SECRET_KEY=your_jwt_secret
```

## React Management 配置

### 服务地址配置
```bash
# React 应用服务配置
export REACT_HOST=localhost           # React 应用主机地址
export REACT_PORT=3000               # React 应用端口

# React 应用连接 Python Server 的配置
export REACT_APP_PYTHON_HOST=localhost      # Python 服务器地址
export REACT_APP_PYTHON_HTTP_PORT=8080      # Python HTTP API 端口
export REACT_APP_PYTHON_WS_PORT=8081        # Python WebSocket 端口

# 或者直接指定完整 API URL
export REACT_APP_API_URL=http://localhost:8080
```

## 使用示例

### 分离部署示例
```bash
# Python Server 部署在 192.168.1.100
export PYTHON_HOST=192.168.1.100
export PYTHON_HTTP_PORT=8080
export PYTHON_WS_PORT=8081

# React Management 部署在 192.168.1.101
export REACT_HOST=192.168.1.101
export REACT_PORT=3000

# React 连接到 Python Server
export REACT_APP_PYTHON_HOST=192.168.1.100
export REACT_APP_PYTHON_HTTP_PORT=8080
export REACT_APP_PYTHON_WS_PORT=8081
```

### 同机部署不同端口示例
```bash
# Python Server
export PYTHON_HOST=0.0.0.0
export PYTHON_HTTP_PORT=9080
export PYTHON_WS_PORT=9081

# React Management
export REACT_HOST=0.0.0.0
export REACT_PORT=9000
export REACT_APP_PYTHON_HOST=localhost
export REACT_APP_PYTHON_HTTP_PORT=9080
export REACT_APP_PYTHON_WS_PORT=9081
```

## 启动方式

### 使用启动脚本
```bash
# 设置环境变量后运行
./start-enhanced.sh
```

### 手动启动
```bash
# 启动 Python Server
cd python-server
PYTHON_HOST=localhost PYTHON_HTTP_PORT=8080 PYTHON_WS_PORT=8081 python enhanced_server.py

# 启动 React Management
cd react-management
HOST=localhost PORT=3000 REACT_APP_PYTHON_HOST=localhost REACT_APP_PYTHON_HTTP_PORT=8080 npm start
```

## 配置优先级

1. **Python Server**: `PYTHON_*` > `HOST/HTTP_PORT/WS_PORT` > 默认值
2. **React Management**: `REACT_*` > 默认值
3. **React API 连接**: `REACT_APP_API_URL` > `REACT_APP_PYTHON_*` > 默认值
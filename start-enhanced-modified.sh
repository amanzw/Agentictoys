#!/bin/bash

# Nova Sonic 多设备管理系统启动脚本

echo "Starting Nova Sonic Multi-Device Management System..."

# 检查环境变量
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "Error: AWS credentials not set"
    echo "Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
    exit 1
fi

if [ -z "$DB_HOST" ] || [ -z "$DB_PASSWORD" ]; then
    echo "Error: Database credentials not set"
    echo "Please set DB_HOST, DB_PASSWORD and other database variables"
    exit 1
fi

# Python Server 环境变量
export PYTHON_HOST=${PYTHON_HOST:-"localhost"}
export PYTHON_WS_PORT=${PYTHON_WS_PORT:-8081}
export PYTHON_HTTP_PORT=${PYTHON_HTTP_PORT:-8080}

# React Management 环境变量
export REACT_HOST=${REACT_HOST:-"localhost"}
export REACT_PORT=${REACT_PORT:-3000}

# AWS 环境变量
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-"us-east-1"}

# 数据库环境变量
export DB_PORT=${DB_PORT:-5432}
export DB_NAME=${DB_NAME:-"nova_sonic"}
export DB_USER=${DB_USER:-"postgres"}

echo "Configuration:"
echo "  Python Server: $PYTHON_HOST:$PYTHON_HTTP_PORT (HTTP), $PYTHON_HOST:$PYTHON_WS_PORT (WebSocket)"
echo "  React Management: $REACT_HOST:$REACT_PORT"
echo "  AWS Region: $AWS_DEFAULT_REGION"
echo "  Database: $DB_HOST:$DB_PORT/$DB_NAME"

# 安装或升级Python3.12


# 安装portautio



# 安装Node.js和npm



# 启动Python服务器
echo "Starting Python server..."
cd python-server
python3.12 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip3.12 install -r requirements.txt
PYTHON_HOST=$PYTHON_HOST PYTHON_WS_PORT=$PYTHON_WS_PORT PYTHON_HTTP_PORT=$PYTHON_HTTP_PORT python3.12 enhanced_server.py &
SERVER_PID=$!

# 等待服务器启动
sleep 3

# 启动React管理界面
echo "Starting React management interface..."
cd ../react-management
npm install
HOST=$REACT_HOST PORT=$REACT_PORT npm start &
REACT_PID=$!

echo "🎉 Nova Sonic Multi-Device Management System Started!"
echo "" 
echo "📊 Service Information:"
echo "  - Python Server PID: $SERVER_PID"
echo "  - React Management PID: $REACT_PID"
echo ""
echo "🌐 Access Points:"
echo "  - Management Interface: http://$REACT_HOST:$REACT_PORT"
echo "  - HTTP API Endpoint: http://$PYTHON_HOST:$PYTHON_HTTP_PORT"
echo "  - WebSocket Endpoint: ws://$PYTHON_HOST:$PYTHON_WS_PORT"
echo "  - Database: $DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo "🔐 Default Credentials:"
echo "  - Admin Login: admin / admin123"
echo "  - Device Login: device / device123"
echo ""
echo "📝 Logs:"
echo "  - Server logs: Check terminal output"
echo "  - Health check: curl http://$PYTHON_HOST:$PYTHON_HTTP_PORT/health"

# 等待用户中断
trap "echo 'Stopping services...'; kill $SERVER_PID $REACT_PID 2>/dev/null; exit 0" INT
wait
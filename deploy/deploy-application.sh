#!/bin/bash

# Nova Sonic 应用部署脚本
# 在 EC2 实例上部署 Nova Sonic 应用

set -e

# 配置变量
APP_DIR="/opt/nova-sonic"
REPO_URL="https://github.com/your-username/nova-sonic.git"  # 替换为实际的仓库地址
PYTHON_DIR="$APP_DIR/python-server"
REACT_DIR="$APP_DIR/react-management"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root 用户
check_user() {
    if [ "$EUID" -eq 0 ]; then
        print_error "请不要以 root 用户运行此脚本"
        exit 1
    fi
}

# 安装系统依赖
install_system_dependencies() {
    print_message "安装系统依赖..."
    
    sudo yum update -y
    sudo yum groupinstall -y "Development Tools"
    sudo yum install -y python3-devel postgresql-devel portaudio-devel
    
    # 安装 Node.js 18
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
    
    print_message "✓ 系统依赖安装完成"
}

# 克隆或更新代码
setup_code() {
    print_message "设置应用代码..."
    
    if [ -d "$APP_DIR" ]; then
        print_warning "应用目录已存在，更新代码..."
        cd $APP_DIR
        git pull origin main
    else
        print_message "克隆代码仓库..."
        sudo mkdir -p $APP_DIR
        sudo chown $USER:$USER $APP_DIR
        git clone $REPO_URL $APP_DIR
        cd $APP_DIR
    fi
    
    print_message "✓ 代码设置完成"
}

# 设置 Python 环境
setup_python_environment() {
    print_message "设置 Python 环境..."
    
    cd $PYTHON_DIR
    
    # 创建虚拟环境
    python3 -m venv venv
    source venv/bin/activate
    
    # 升级 pip
    pip install --upgrade pip
    
    # 安装依赖
    pip install -r requirements.txt
    
    print_message "✓ Python 环境设置完成"
}

# 设置 React 环境
setup_react_environment() {
    print_message "设置 React 环境..."
    
    cd $REACT_DIR
    
    # 安装依赖
    npm install
    
    # 构建生产版本
    npm run build
    
    print_message "✓ React 环境设置完成"
}

# 配置环境变量
configure_environment() {
    print_message "配置环境变量..."
    
    # 从 CloudFormation 输出或环境变量获取数据库信息
    if [ -z "$DB_HOST" ]; then
        print_error "DB_HOST 环境变量未设置"
        exit 1
    fi
    
    # 创建环境配置文件
    cat > $APP_DIR/.env << EOF
# AWS 基础配置
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}

# 数据库配置
export DB_HOST=$DB_HOST
export DB_PORT=${DB_PORT:-5432}
export DB_NAME=${DB_NAME:-nova_sonic}
export DB_USER=${DB_USER:-postgres}
export DB_PASSWORD=$DB_PASSWORD

# Python Server 配置
export PYTHON_HOST=0.0.0.0
export PYTHON_HTTP_PORT=8080
export PYTHON_WS_PORT=8081

# React Management 配置
export REACT_HOST=0.0.0.0
export REACT_PORT=3000
export REACT_APP_PYTHON_HOST=\$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
export REACT_APP_PYTHON_HTTP_PORT=8080
export REACT_APP_PYTHON_WS_PORT=8081

# 安全配置
export JWT_SECRET_KEY=\$(openssl rand -base64 32)

# 用户管理配置
export ALLOW_DEVICE_REGISTRATION=true
export ALLOW_DEVICE_PASSWORD_CHANGE=true
EOF
    
    # 设置权限
    chmod 600 $APP_DIR/.env
    
    print_message "✓ 环境变量配置完成"
}

# 初始化数据库
initialize_database() {
    print_message "初始化数据库..."
    
    cd $PYTHON_DIR
    source venv/bin/activate
    source $APP_DIR/.env
    
    # 运行数据库初始化脚本
    python3 -c "
import asyncio
from database import init_database

async def main():
    await init_database()
    print('数据库初始化完成')

asyncio.run(main())
"
    
    print_message "✓ 数据库初始化完成"
}

# 创建 systemd 服务
create_systemd_services() {
    print_message "创建 systemd 服务..."
    
    # Python 服务
    sudo tee /etc/systemd/system/nova-sonic-python.service > /dev/null << EOF
[Unit]
Description=Nova Sonic Python Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PYTHON_DIR
Environment=PATH=$PYTHON_DIR/venv/bin
EnvironmentFile=$APP_DIR/.env
ExecStart=$PYTHON_DIR/venv/bin/python enhanced_server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    # React 服务 (使用 serve 静态服务器)
    sudo npm install -g serve
    
    sudo tee /etc/systemd/system/nova-sonic-react.service > /dev/null << EOF
[Unit]
Description=Nova Sonic React Management Interface
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REACT_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/serve -s build -l 3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载 systemd
    sudo systemctl daemon-reload
    
    # 启用服务
    sudo systemctl enable nova-sonic-python
    sudo systemctl enable nova-sonic-react
    
    print_message "✓ systemd 服务创建完成"
}

# 启动服务
start_services() {
    print_message "启动服务..."
    
    # 启动 Python 服务
    sudo systemctl start nova-sonic-python
    sleep 5
    
    # 启动 React 服务
    sudo systemctl start nova-sonic-react
    sleep 5
    
    # 检查服务状态
    if sudo systemctl is-active --quiet nova-sonic-python; then
        print_message "✓ Python 服务启动成功"
    else
        print_error "Python 服务启动失败"
        sudo systemctl status nova-sonic-python
        exit 1
    fi
    
    if sudo systemctl is-active --quiet nova-sonic-react; then
        print_message "✓ React 服务启动成功"
    else
        print_error "React 服务启动失败"
        sudo systemctl status nova-sonic-react
        exit 1
    fi
}

# 配置防火墙
configure_firewall() {
    print_message "配置防火墙..."
    
    # Amazon Linux 2023 使用 firewalld
    if command -v firewall-cmd &> /dev/null; then
        sudo firewall-cmd --permanent --add-port=8080/tcp
        sudo firewall-cmd --permanent --add-port=8081/tcp
        sudo firewall-cmd --permanent --add-port=3000/tcp
        sudo firewall-cmd --reload
        print_message "✓ 防火墙配置完成"
    else
        print_warning "未找到 firewalld，跳过防火墙配置"
    fi
}

# 显示部署信息
show_deployment_info() {
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
    
    echo ""
    echo "=== Nova Sonic 应用部署完成 ==="
    echo ""
    echo "服务访问地址:"
    echo "  Python HTTP API: http://$PUBLIC_IP:8080"
    echo "  Python WebSocket: ws://$PUBLIC_IP:8081"
    echo "  React 管理界面: http://$PUBLIC_IP:3000"
    echo ""
    echo "默认登录账户:"
    echo "  管理员: admin / admin123"
    echo "  设备用户: device / device123"
    echo ""
    echo "服务管理命令:"
    echo "  查看状态: sudo systemctl status nova-sonic-python nova-sonic-react"
    echo "  重启服务: sudo systemctl restart nova-sonic-python nova-sonic-react"
    echo "  查看日志: sudo journalctl -u nova-sonic-python -f"
    echo "           sudo journalctl -u nova-sonic-react -f"
    echo ""
    echo "应用目录: $APP_DIR"
    echo "配置文件: $APP_DIR/.env"
}

# 主函数
main() {
    echo "=== Nova Sonic 应用部署脚本 ==="
    echo ""
    
    check_user
    install_system_dependencies
    setup_code
    setup_python_environment
    setup_react_environment
    configure_environment
    initialize_database
    create_systemd_services
    configure_firewall
    start_services
    show_deployment_info
    
    print_message "部署完成！"
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
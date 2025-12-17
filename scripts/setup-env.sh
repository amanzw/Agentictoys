#!/bin/bash

# =============================================================================
# Nova Sonic S2S 环境配置脚本
# =============================================================================

set -e

echo "🚀 Nova Sonic S2S 环境配置向导"
echo "================================"

# 检查是否存在 .env 文件
if [ -f ".env" ]; then
    echo "⚠️  发现现有 .env 文件"
    read -p "是否覆盖现有配置? (y/N): " overwrite
    if [[ ! $overwrite =~ ^[Yy]$ ]]; then
        echo "❌ 配置已取消"
        exit 0
    fi
fi

# 复制模板文件
cp .env.template .env
echo "✅ 已创建 .env 配置文件"

# 交互式配置关键参数
echo ""
echo "📝 配置关键参数 (按 Enter 使用默认值)"
echo "================================"

# AWS 配置
read -p "AWS Access Key ID: " aws_key
if [ ! -z "$aws_key" ]; then
    sed -i.bak "s/AWS_ACCESS_KEY_ID=.*/AWS_ACCESS_KEY_ID=$aws_key/" .env
fi

read -p "AWS Secret Access Key: " aws_secret
if [ ! -z "$aws_secret" ]; then
    sed -i.bak "s/AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=$aws_secret/" .env
fi

read -p "AWS Region [us-east-1]: " aws_region
aws_region=${aws_region:-us-east-1}
sed -i.bak "s/AWS_DEFAULT_REGION=.*/AWS_DEFAULT_REGION=$aws_region/" .env

# 数据库配置
echo ""
echo "🗄️  数据库配置"
read -p "数据库主机 [localhost]: " db_host
db_host=${db_host:-localhost}
sed -i.bak "s/DB_HOST=.*/DB_HOST=$db_host/" .env

read -p "数据库端口 [5432]: " db_port
db_port=${db_port:-5432}
sed -i.bak "s/DB_PORT=.*/DB_PORT=$db_port/" .env

read -p "数据库名称 [nova_sonic]: " db_name
db_name=${db_name:-nova_sonic}
sed -i.bak "s/DB_NAME=.*/DB_NAME=$db_name/" .env

read -p "数据库用户 [postgres]: " db_user
db_user=${db_user:-postgres}
sed -i.bak "s/DB_USER=.*/DB_USER=$db_user/" .env

read -s -p "数据库密码: " db_password
echo ""
if [ ! -z "$db_password" ]; then
    sed -i.bak "s/DB_PASSWORD=.*/DB_PASSWORD=$db_password/" .env
fi

# JWT 配置
echo ""
echo "🔐 安全配置"
jwt_secret=$(openssl rand -base64 32 2>/dev/null || echo "your_jwt_secret_key_$(date +%s)")
sed -i.bak "s/JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$jwt_secret/" .env
echo "✅ 已生成 JWT 密钥"

# 服务器端口配置
echo ""
echo "🌐 服务器配置"
read -p "WebSocket 端口 [8081]: " ws_port
ws_port=${ws_port:-8081}
sed -i.bak "s/WS_PORT=.*/WS_PORT=$ws_port/" .env

read -p "HTTP API 端口 [8080]: " http_port
http_port=${http_port:-8080}
sed -i.bak "s/HTTP_PORT=.*/HTTP_PORT=$http_port/" .env

# 可选功能配置
echo ""
echo "🔧 可选功能配置 (可稍后配置)"
echo "================================"

read -p "Knowledge Base ID (可选): " kb_id
if [ ! -z "$kb_id" ]; then
    sed -i.bak "s/KB_ID=.*/KB_ID=$kb_id/" .env
fi

read -p "Booking Lambda ARN (可选): " lambda_arn
if [ ! -z "$lambda_arn" ]; then
    sed -i.bak "s|BOOKING_LAMBDA_ARN=.*|BOOKING_LAMBDA_ARN=$lambda_arn|" .env
fi

# 清理备份文件
rm -f .env.bak

echo ""
echo "✅ 环境配置完成!"
echo ""
echo "📋 配置摘要:"
echo "  - AWS Region: $aws_region"
echo "  - 数据库: $db_host:$db_port/$db_name"
echo "  - WebSocket 端口: $ws_port"
echo "  - HTTP API 端口: $http_port"
echo ""
echo "🔧 下一步:"
echo "  1. 检查并编辑 .env 文件中的其他配置"
echo "  2. 运行 ./start-enhanced.sh 启动服务"
echo ""
echo "📖 更多配置选项请参考 .env.template 文件"
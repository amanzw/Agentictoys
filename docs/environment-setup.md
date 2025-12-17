# 环境变量配置指南

## 快速配置

### 1. 使用配置向导 (推荐)
```bash
# 运行交互式配置脚本
./scripts/setup-env.sh
```

### 2. 手动配置
```bash
# 复制模板文件
cp .env.template .env

# 编辑配置文件
nano .env  # 或使用其他编辑器
```

## 配置分类

### 🔴 必需配置
这些配置是系统运行的基本要求：

```bash
# AWS 凭证
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=us-east-1

# 数据库连接
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_sonic
DB_USER=postgres
DB_PASSWORD=your_password

# JWT 安全密钥
JWT_SECRET_KEY=your_strong_secret_key
```

### 🟡 推荐配置
这些配置影响系统性能和安全：

```bash
# 服务器端口
WS_PORT=8081
HTTP_PORT=8080

# 认证配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
DEVICE_USERNAME=device
DEVICE_PASSWORD=device123

# 日志配置
LOG_LEVEL=INFO
LOG_FILE_PATH=./logs/server.log
```

### 🟢 可选配置
根据需要启用的功能进行配置：

```bash
# Knowledge Base (RAG)
KB_ID=your_kb_id
KB_REGION=us-east-1

# Bedrock Agents
BOOKING_LAMBDA_ARN=arn:aws:lambda:...

# MCP 集成
AWS_PROFILE=default

# 性能调优
MAX_CONCURRENT_DEVICES=50
WS_TIMEOUT=300
```

## 功能模块配置

### Knowledge Base (RAG)
```bash
# 启用 RAG 功能需要配置
KB_ID=your_knowledge_base_id
KB_REGION=us-east-1  # 可选，默认使用 AWS_DEFAULT_REGION
```

### MCP 集成
```bash
# 启用 MCP 需要配置
AWS_PROFILE=default  # 确保有 Location Service 权限
```

### Bedrock Agents
```bash
# 部署 CloudFormation 后获取
BOOKING_LAMBDA_ARN=arn:aws:lambda:us-east-1:123456789012:function:BookingFunction

# 可选配置
BEDROCK_AGENT_ID=your_agent_id
BEDROCK_AGENT_ALIAS_ID=your_alias_id
```

### Strands Agent
```bash
# 天气查询功能
WEATHER_API_KEY=your_weather_api_key
AWS_PROFILE=default  # 需要 Location Service 权限
```

## 环境特定配置

### 开发环境
```bash
ENVIRONMENT=development
DEBUG=true
VERBOSE_LOGGING=true
MOCK_MODE=false  # 设为 true 可模拟 AWS 服务
```

### 生产环境
```bash
ENVIRONMENT=production
DEBUG=false
VERBOSE_LOGGING=false
LOG_LEVEL=WARNING

# 安全配置
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_PER_MINUTE=30
MAX_REQUEST_SIZE=5
```

## 配置验证

### 检查必需配置
```bash
# 验证 AWS 凭证
aws sts get-caller-identity

# 测试数据库连接
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;"
```

### 验证可选功能
```bash
# 验证 Knowledge Base
aws bedrock-agent-runtime retrieve --knowledge-base-id $KB_ID --retrieval-query "test"

# 验证 Lambda 函数
aws lambda get-function --function-name $BOOKING_LAMBDA_ARN
```

## 常见问题

### Q: JWT_SECRET_KEY 如何生成？
```bash
# 使用 openssl 生成
openssl rand -base64 32

# 或使用 Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Q: 数据库密码包含特殊字符怎么办？
```bash
# 使用单引号包围或转义特殊字符
DB_PASSWORD='password@123'
# 或
DB_PASSWORD=password\@123
```

### Q: 如何在容器中使用环境变量？
```bash
# Docker 运行时传入
docker run -d --env-file .env your-image

# Docker Compose
version: '3'
services:
  app:
    env_file: .env
```

### Q: 生产环境如何管理敏感配置？
推荐使用：
- AWS Systems Manager Parameter Store
- AWS Secrets Manager
- Kubernetes Secrets
- HashiCorp Vault

## 配置模板说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| AWS_ACCESS_KEY_ID | 必需 | - | AWS 访问密钥 |
| AWS_SECRET_ACCESS_KEY | 必需 | - | AWS 密钥 |
| DB_HOST | 必需 | localhost | 数据库主机 |
| WS_PORT | 推荐 | 8081 | WebSocket 端口 |
| JWT_SECRET_KEY | 必需 | - | JWT 签名密钥 |
| KB_ID | 可选 | - | Knowledge Base ID |
| LOG_LEVEL | 推荐 | INFO | 日志级别 |
| MAX_CONCURRENT_DEVICES | 可选 | 50 | 最大设备数 |

## 安全建议

1. **不要提交 .env 文件到版本控制**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **定期轮换密钥**
   - JWT 密钥每 90 天更换
   - 数据库密码每 180 天更换

3. **使用强密码**
   - 至少 16 位字符
   - 包含大小写字母、数字、特殊字符

4. **限制权限**
   - AWS IAM 使用最小权限原则
   - 数据库用户只授予必要权限
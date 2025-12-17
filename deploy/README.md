# Nova Sonic AWS 基础设施部署指南

本目录包含了 Nova Sonic 多设备管理系统的完整 AWS 基础设施部署脚本和配置文件。

## 文件说明

- `nova-sonic-infrastructure.yaml` - CloudFormation 基础设施模板
- `deploy-infrastructure.sh` - 基础设施自动部署脚本
- `deploy-application.sh` - 应用自动部署脚本
- `rds-setup.yaml` - 原始 RDS 设置模板（已集成到基础设施模板中）

## 基础设施架构

### 网络架构
- **VPC**: 10.0.0.0/16
- **公有子网**: 
  - 公有子网1: 10.0.1.0/24 (AZ-a)
  - 公有子网2: 10.0.2.0/24 (AZ-b)
- **私有子网**:
  - 私有子网1: 10.0.3.0/24 (AZ-a)
  - 私有子网2: 10.0.4.0/24 (AZ-b)
- **NAT Gateway**: 部署在公有子网1，为私有子网提供出站访问

### 计算资源
- **EC2 实例**: 部署在公有子网1，默认类型 c6i.2xlarge
- **支持的实例类型**:
  - t3.medium/large/xlarge (通用型)
  - c6i.large/xlarge/2xlarge/4xlarge (计算优化型)
  - m6i.large/xlarge/2xlarge (通用型)

### 数据库
- **RDS PostgreSQL**: 部署在私有子网，默认 db.t3.micro
- **支持的实例类型**:
  - db.t3.micro/small/medium (通用型)
  - db.r5.large/xlarge (内存优化型)
- **配置**:
  - 引擎版本: PostgreSQL 17.4
  - 存储: 20GB GP2，加密存储
  - 备份保留: 7天
  - 多AZ: 关闭（可根据需要开启）

### 安全组配置
- **EC2 安全组**:
  - SSH (22): 0.0.0.0/0
  - HTTP (80): 0.0.0.0/0
  - HTTPS (443): 0.0.0.0/0
  - Python HTTP (8080): 0.0.0.0/0
  - Python WebSocket (8081): 0.0.0.0/0
  - React 管理界面 (3000): 0.0.0.0/0

- **RDS 安全组**:
  - PostgreSQL (5432): 仅允许 EC2 安全组和 VPC 内部访问

### IAM 权限
- **EC2 角色权限**:
  - AmazonBedrockFullAccess
  - CloudWatchAgentServerPolicy
  - SecretsManager 读取权限

## 部署步骤

### 1. 准备工作

确保已安装并配置 AWS CLI：
```bash
# 安装 AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# 配置 AWS 凭证
aws configure
```

创建 SSH 密钥对（如果没有）：
```bash
aws ec2 create-key-pair --key-name nova-sonic-key --query 'KeyMaterial' --output text > nova-sonic-key.pem
chmod 400 nova-sonic-key.pem
```

### 2. 部署基础设施

运行基础设施部署脚本：
```bash
cd deploy
./deploy-infrastructure.sh
```

脚本会引导您：
1. 选择 EC2 实例类型
2. 选择 RDS 实例类型
3. 设置数据库密码
4. 选择 SSH 密钥对

部署完成后，脚本会输出：
- EC2 实例的公网 IP
- 数据库连接信息
- 应用访问地址

### 3. 部署应用

SSH 连接到 EC2 实例：
```bash
ssh -i nova-sonic-key.pem ec2-user@<EC2_PUBLIC_IP>
```

在 EC2 实例上运行应用部署脚本：
```bash
# 下载部署脚本
curl -O https://raw.githubusercontent.com/your-repo/nova-sonic/main/deploy/deploy-application.sh
chmod +x deploy-application.sh

# 运行部署脚本
./deploy-application.sh
```

### 4. 验证部署

部署完成后，访问以下地址验证：
- Python HTTP API: `http://<EC2_PUBLIC_IP>:8080`
- Python WebSocket: `ws://<EC2_PUBLIC_IP>:8081`
- React 管理界面: `http://<EC2_PUBLIC_IP>:3000`

默认登录账户：
- 管理员: `admin` / `admin123`
- 设备用户: `device` / `device123`

## 手动部署（可选）

如果需要手动部署，可以使用 AWS CLI：

```bash
# 部署基础设施
aws cloudformation create-stack \
  --stack-name nova-sonic-infrastructure \
  --template-body file://nova-sonic-infrastructure.yaml \
  --parameters \
    ParameterKey=EC2InstanceType,ParameterValue=c6i.2xlarge \
    ParameterKey=DBInstanceClass,ParameterValue=db.t3.micro \
    ParameterKey=DBPassword,ParameterValue=YourSecurePassword123 \
    ParameterKey=KeyPairName,ParameterValue=nova-sonic-key \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# 等待部署完成
aws cloudformation wait stack-create-complete \
  --stack-name nova-sonic-infrastructure \
  --region us-east-1
```

## 成本估算

### 基础配置（测试环境）
- EC2 t3.medium: ~$30/月
- RDS db.t3.micro: ~$13/月
- NAT Gateway: ~$32/月
- 存储和数据传输: ~$5/月
- **总计**: ~$80/月

### 生产配置
- EC2 c6i.2xlarge: ~$250/月
- RDS db.t3.medium: ~$60/月
- NAT Gateway: ~$32/月
- 存储和数据传输: ~$20/月
- **总计**: ~$362/月

*注意：价格基于 us-east-1 区域，实际费用可能因使用量而异*

## 监控和维护

### 服务管理
```bash
# 查看服务状态
sudo systemctl status nova-sonic-python nova-sonic-react

# 重启服务
sudo systemctl restart nova-sonic-python nova-sonic-react

# 查看日志
sudo journalctl -u nova-sonic-python -f
sudo journalctl -u nova-sonic-react -f
```

### 数据库维护
```bash
# 连接数据库
psql -h <DB_ENDPOINT> -U postgres -d nova_sonic

# 备份数据库
pg_dump -h <DB_ENDPOINT> -U postgres nova_sonic > backup.sql
```

### 更新应用
```bash
cd /opt/nova-sonic
git pull origin main
sudo systemctl restart nova-sonic-python nova-sonic-react
```

## 故障排除

### 常见问题

1. **EC2 实例无法访问**
   - 检查安全组配置
   - 确认实例状态为 running
   - 验证 SSH 密钥权限

2. **数据库连接失败**
   - 检查 RDS 实例状态
   - 验证安全组规则
   - 确认数据库密码正确

3. **应用服务启动失败**
   - 查看服务日志：`sudo journalctl -u nova-sonic-python -f`
   - 检查环境变量配置
   - 验证依赖包安装

### 日志位置
- 系统日志: `/var/log/messages`
- 应用日志: `sudo journalctl -u nova-sonic-python`
- CloudFormation 事件: AWS 控制台 CloudFormation 页面

## 清理资源

删除 CloudFormation 栈以清理所有资源：
```bash
aws cloudformation delete-stack --stack-name nova-sonic-infrastructure --region us-east-1
```

**注意**: 删除栈会永久删除所有资源，包括数据库数据。请确保已备份重要数据。

## 安全建议

1. **定期更新密码**: 更改默认数据库密码和应用登录密码
2. **限制访问**: 根据需要限制安全组的访问范围
3. **启用 HTTPS**: 在生产环境中配置 SSL/TLS 证书
4. **监控访问**: 启用 CloudTrail 和 CloudWatch 监控
5. **备份策略**: 配置自动备份和快照策略
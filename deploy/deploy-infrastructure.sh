#!/bin/bash

# Nova Sonic 基础设施部署脚本
# 使用 CloudFormation 部署完整的 AWS 基础设施

set -e

# 配置变量
STACK_NAME="nova-sonic-infrastructure"
TEMPLATE_FILE="nova-sonic-infrastructure.yaml"
REGION="us-east-1"

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

# 检查必需的工具
check_prerequisites() {
    print_message "检查必需的工具..."
    
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI 未安装。请安装 AWS CLI 并配置凭证。"
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS 凭证未配置或无效。请运行 'aws configure' 配置凭证。"
        exit 1
    fi
    
    print_message "✓ AWS CLI 已安装并配置"
}

# 获取用户输入
get_user_input() {
    print_message "收集部署参数..."
    
    # EC2 实例类型
    echo "选择 EC2 实例类型:"
    echo "1) t3.medium (2 vCPU, 4 GB RAM) - 测试环境"
    echo "2) t3.large (2 vCPU, 8 GB RAM) - 小型生产环境"
    echo "3) c6i.large (2 vCPU, 4 GB RAM) - 计算优化"
    echo "4) c6i.xlarge (4 vCPU, 8 GB RAM) - 计算优化"
    echo "5) c6i.2xlarge (8 vCPU, 16 GB RAM) - 默认推荐"
    echo "6) c6i.4xlarge (16 vCPU, 32 GB RAM) - 高性能"
    read -p "请选择 (1-6, 默认: 5): " ec2_choice
    
    case $ec2_choice in
        1) EC2_INSTANCE_TYPE="t3.medium" ;;
        2) EC2_INSTANCE_TYPE="t3.large" ;;
        3) EC2_INSTANCE_TYPE="c6i.large" ;;
        4) EC2_INSTANCE_TYPE="c6i.xlarge" ;;
        6) EC2_INSTANCE_TYPE="c6i.4xlarge" ;;
        *) EC2_INSTANCE_TYPE="c6i.2xlarge" ;;
    esac
    
    # RDS 实例类型
    echo ""
    echo "选择 RDS 实例类型:"
    echo "1) db.t3.micro (1 vCPU, 1 GB RAM) - 测试环境"
    echo "2) db.t3.small (1 vCPU, 2 GB RAM) - 小型生产环境"
    echo "3) db.t3.medium (2 vCPU, 4 GB RAM) - 中型生产环境"
    echo "4) db.r5.large (2 vCPU, 16 GB RAM) - 内存优化"
    read -p "请选择 (1-4, 默认: 1): " db_choice
    
    case $db_choice in
        2) DB_INSTANCE_CLASS="db.t3.small" ;;
        3) DB_INSTANCE_CLASS="db.t3.medium" ;;
        4) DB_INSTANCE_CLASS="db.r5.large" ;;
        *) DB_INSTANCE_CLASS="db.t3.micro" ;;
    esac
    
    # 数据库密码
    echo ""
    while true; do
        read -s -p "请输入数据库密码 (至少8位): " DB_PASSWORD
        echo ""
        if [ ${#DB_PASSWORD} -ge 8 ]; then
            break
        else
            print_error "密码长度至少8位，请重新输入"
        fi
    done
    
    # SSH 密钥对
    echo ""
    print_message "获取可用的 SSH 密钥对..."
    KEY_PAIRS=$(aws ec2 describe-key-pairs --region $REGION --query 'KeyPairs[].KeyName' --output text)
    
    if [ -z "$KEY_PAIRS" ]; then
        print_error "未找到 SSH 密钥对。请先创建一个密钥对："
        echo "aws ec2 create-key-pair --key-name nova-sonic-key --query 'KeyMaterial' --output text > nova-sonic-key.pem"
        echo "chmod 400 nova-sonic-key.pem"
        exit 1
    fi
    
    echo "可用的 SSH 密钥对:"
    echo "$KEY_PAIRS"
    read -p "请输入要使用的密钥对名称: " KEY_PAIR_NAME
    
    if ! echo "$KEY_PAIRS" | grep -q "$KEY_PAIR_NAME"; then
        print_error "指定的密钥对不存在"
        exit 1
    fi
}

# 部署 CloudFormation 栈
deploy_stack() {
    print_message "开始部署 CloudFormation 栈..."
    
    # 检查栈是否已存在
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null; then
        print_warning "栈 $STACK_NAME 已存在，将进行更新..."
        OPERATION="update-stack"
    else
        print_message "创建新栈 $STACK_NAME..."
        OPERATION="create-stack"
    fi
    
    # 部署参数
    PARAMETERS="ParameterKey=EC2InstanceType,ParameterValue=$EC2_INSTANCE_TYPE"
    PARAMETERS="$PARAMETERS ParameterKey=DBInstanceClass,ParameterValue=$DB_INSTANCE_CLASS"
    PARAMETERS="$PARAMETERS ParameterKey=DBPassword,ParameterValue=$DB_PASSWORD"
    PARAMETERS="$PARAMETERS ParameterKey=KeyPairName,ParameterValue=$KEY_PAIR_NAME"
    
    # 执行部署
    aws cloudformation $OPERATION \
        --stack-name $STACK_NAME \
        --template-body file://$TEMPLATE_FILE \
        --parameters $PARAMETERS \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION
    
    print_message "等待栈部署完成..."
    aws cloudformation wait stack-${OPERATION%-stack}-complete \
        --stack-name $STACK_NAME \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        print_message "✓ 栈部署成功！"
    else
        print_error "栈部署失败"
        exit 1
    fi
}

# 获取输出信息
get_outputs() {
    print_message "获取部署输出信息..."
    
    OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs' \
        --output table)
    
    echo ""
    echo "=== 部署完成 ==="
    echo "$OUTPUTS"
    
    # 获取关键信息
    EC2_PUBLIC_IP=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`EC2PublicIP`].OutputValue' \
        --output text)
    
    DB_ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`DBEndpoint`].OutputValue' \
        --output text)
    
    echo ""
    echo "=== 快速访问信息 ==="
    echo "SSH 连接: ssh -i $KEY_PAIR_NAME.pem ec2-user@$EC2_PUBLIC_IP"
    echo "Python HTTP: http://$EC2_PUBLIC_IP:8080"
    echo "Python WebSocket: ws://$EC2_PUBLIC_IP:8081"
    echo "React 管理界面: http://$EC2_PUBLIC_IP:3000"
    echo "数据库端点: $DB_ENDPOINT"
    echo ""
    echo "=== 下一步 ==="
    echo "1. SSH 连接到 EC2 实例"
    echo "2. 克隆项目代码到 /opt/nova-sonic"
    echo "3. 配置环境变量（已自动设置数据库连接）"
    echo "4. 启动应用服务"
}

# 主函数
main() {
    echo "=== Nova Sonic 基础设施部署脚本 ==="
    echo ""
    
    check_prerequisites
    get_user_input
    deploy_stack
    get_outputs
    
    print_message "部署完成！"
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
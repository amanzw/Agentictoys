#!/bin/bash

# Nova Sonic RDS PostgreSQL 部署脚本

set -e

STACK_NAME="nova-sonic-rds"
TEMPLATE_FILE="rds-setup.yaml"

echo "Deploying Nova Sonic RDS PostgreSQL..."

# 检查必需参数
if [ -z "$VPC_ID" ] || [ -z "$SUBNET_IDS" ] || [ -z "$DB_PASSWORD" ]; then
    echo "Error: Required parameters not set"
    echo "Please set:"
    echo "  VPC_ID - VPC ID for RDS deployment"
    echo "  SUBNET_IDS - Comma-separated subnet IDs (at least 2 in different AZs)"
    echo "  DB_PASSWORD - Database master password (min 8 characters)"
    echo ""
    echo "Example:"
    echo "  export VPC_ID=vpc-12345678"
    echo "  export SUBNET_IDS=subnet-12345678,subnet-87654321"
    echo "  export DB_PASSWORD=YourSecurePassword123"
    exit 1
fi

# 可选参数
DB_INSTANCE_CLASS=${DB_INSTANCE_CLASS:-"db.t3.micro"}
DB_NAME=${DB_NAME:-"nova_sonic"}
DB_USERNAME=${DB_USERNAME:-"postgres"}

echo "Configuration:"
echo "  Stack Name: $STACK_NAME"
echo "  VPC ID: $VPC_ID"
echo "  Subnet IDs: $SUBNET_IDS"
echo "  DB Instance Class: $DB_INSTANCE_CLASS"
echo "  DB Name: $DB_NAME"
echo "  DB Username: $DB_USERNAME"

# 部署CloudFormation堆栈
aws cloudformation deploy \
    --template-file "$TEMPLATE_FILE" \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
        VpcId="$VPC_ID" \
        SubnetIds="$SUBNET_IDS" \
        DBInstanceClass="$DB_INSTANCE_CLASS" \
        DBName="$DB_NAME" \
        DBUsername="$DB_USERNAME" \
        DBPassword="$DB_PASSWORD" \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset

# 获取输出信息
echo ""
echo "Deployment completed! Getting connection information..."

DB_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='DBEndpoint'].OutputValue" \
    --output text)

DB_PORT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='DBPort'].OutputValue" \
    --output text)

echo ""
echo "🎉 RDS PostgreSQL deployed successfully!"
echo ""
echo "Connection Information:"
echo "  Endpoint: $DB_ENDPOINT"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USERNAME"
echo ""
echo "Environment Variables for Nova Sonic:"
echo "  export DB_HOST=\"$DB_ENDPOINT\""
echo "  export DB_PORT=\"$DB_PORT\""
echo "  export DB_NAME=\"$DB_NAME\""
echo "  export DB_USER=\"$DB_USERNAME\""
echo "  export DB_PASSWORD=\"$DB_PASSWORD\""
echo ""
echo "Save these environment variables for your Nova Sonic deployment!"
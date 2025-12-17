# 用户管理功能说明

## 概述

Nova Sonic 系统现在支持完整的用户管理功能，包括设备端和管理端的用户注册、密码修改等操作。系统保留了原有的默认用户，同时提供了灵活的用户管理能力。

## 默认用户

系统初始化时会自动创建以下默认用户：

### 管理员用户
- **用户名**: `admin`
- **密码**: `admin123`
- **角色**: `admin`
- **权限**: 完整的系统管理权限

### 设备用户
- **用户名**: `device`
- **密码**: `device123`
- **角色**: `device_user`
- **权限**: 设备连接和基本操作权限

## 设备端用户管理

### 用户注册

设备端可以通过WebSocket连接注册新用户：

```python
# Python客户端示例
await device.register_user("new_device_user", "secure_password")
```

WebSocket消息格式：
```json
{
    "user_action": {
        "action": "register",
        "username": "new_device_user",
        "password": "secure_password"
    }
}
```

服务器响应：
```json
{
    "type": "user_register_result",
    "success": true,
    "message": "User created successfully"
}
```

### 密码修改

设备端可以修改现有用户的密码：

```python
# Python客户端示例
await device.change_password("username", "old_password", "new_password")
```

WebSocket消息格式：
```json
{
    "user_action": {
        "action": "change_password",
        "username": "existing_user",
        "old_password": "current_password",
        "new_password": "new_secure_password"
    }
}
```

服务器响应：
```json
{
    "type": "password_change_result",
    "success": true,
    "message": "Password changed successfully"
}
```

## 管理端用户管理

### 用户列表查看

管理员可以查看所有用户：

```bash
GET /api/users
Authorization: Bearer <jwt_token>
```

响应示例：
```json
[
    {
        "username": "admin",
        "role": "admin",
        "created_at": "2024-01-01T00:00:00Z",
        "last_login": "2024-01-02T10:30:00Z"
    },
    {
        "username": "device",
        "role": "device_user",
        "created_at": "2024-01-01T00:00:00Z",
        "last_login": "2024-01-02T09:15:00Z"
    }
]
```

### 创建新用户

管理员可以通过API创建新用户：

```bash
POST /api/auth/register
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
    "username": "new_user",
    "password": "secure_password",
    "role": "device_user"
}
```

### 修改密码

任何用户都可以修改自己的密码：

```bash
POST /api/auth/change-password
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
    "username": "user",
    "old_password": "current_password",
    "new_password": "new_password"
}
```

## React管理界面

### 用户管理页面

管理界面新增了"User Management"标签页，提供以下功能：

1. **用户列表显示**
   - 用户名
   - 角色
   - 创建时间
   - 最后登录时间

2. **创建用户**
   - 点击"Create User"按钮
   - 填写用户名、密码和角色
   - 支持角色选择：Device User 或 Admin

3. **修改密码**
   - 点击"Change Password"按钮
   - 输入用户名、当前密码和新密码
   - 支持修改任何用户的密码

## 安全特性

### 密码哈希

- 新用户使用bcrypt进行密码哈希
- 向后兼容原有的SHA256哈希
- 自动升级哈希算法

### 权限控制

- 设备端只能创建`device_user`角色用户
- 管理端可以创建任何角色用户
- 用户列表查看需要管理员权限

### JWT认证

- 所有API操作需要有效的JWT token
- Token包含用户信息和权限
- 自动过期和刷新机制

## 配置选项

### 环境变量

```bash
# 允许设备端注册新用户
ALLOW_DEVICE_REGISTRATION=true

# 允许设备端修改密码
ALLOW_DEVICE_PASSWORD_CHANGE=true

# 密码最小长度
PASSWORD_MIN_LENGTH=6

# JWT密钥
JWT_SECRET_KEY=your_secure_secret_key

# JWT过期时间（秒）
JWT_EXPIRATION=86400
```

### 数据库表结构

```sql
-- 用户表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'device_user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

## 错误处理

### 常见错误

1. **用户名已存在**
   ```json
   {
       "success": false,
       "message": "Username already exists"
   }
   ```

2. **密码验证失败**
   ```json
   {
       "success": false,
       "message": "Invalid credentials"
   }
   ```

3. **权限不足**
   ```json
   {
       "error": "Admin access required"
   }
   ```

4. **认证失败**
   ```json
   {
       "error": "Authentication required"
   }
   ```

## 配置更新自动重连

### 支持的配置项

以下配置修改会触发设备自动断开重连：
- `system_prompt` - 系统提示词
- `voice_id` - 语音角色
- `enable_mcp` - MCP功能开关
- `mcp_servers` - MCP服务器配置
- `enable_strands` - Strands功能开关
- `enable_kb` - 知识库功能开关
- `enable_agents` - Bedrock Agents功能开关

### 会话重启流程

1. 管理端修改配置
2. 服务端自动断开与Sonic的S2S会话
3. WebSocket连接保持不断，设备端无需重新认证
4. 设备端下次发送事件时自动创建新会话
5. 新会话使用最新配置，立即生效

## 最佳实践

### 密码安全

1. 使用强密码（至少6位，包含字母数字）
2. 定期更换密码
3. 不要在代码中硬编码密码
4. 使用环境变量管理敏感信息

### 用户管理

1. 为不同设备创建独立用户账号
2. 定期清理不活跃用户
3. 监控用户登录活动
4. 及时更新用户权限

### 系统安全

1. 定期更新JWT密钥
2. 监控异常登录活动
3. 实施访问日志记录
4. 定期备份用户数据

## 故障排除

### 用户注册失败

1. 检查用户名是否已存在
2. 验证密码长度是否符合要求
3. 确认网络连接正常
4. 查看服务器日志

### 密码修改失败

1. 确认当前密码正确
2. 检查新密码格式
3. 验证用户权限
4. 确认JWT token有效

### 管理界面访问问题

1. 确认管理员账号正常
2. 检查JWT token是否过期
3. 验证API服务器连接
4. 查看浏览器控制台错误

## 升级说明

### 从旧版本升级

1. 现有用户数据自动保留
2. 密码哈希自动升级
3. 新功能默认启用
4. 向后兼容保证

### 数据迁移

系统启动时会自动：
1. 创建用户管理相关表
2. 初始化默认用户
3. 升级现有密码哈希
4. 设置默认权限
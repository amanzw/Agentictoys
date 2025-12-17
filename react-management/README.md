# Nova Sonic Management Interface

## 概述

这是一个专门用于管理和配置 Nova Sonic Python 后端的 React 管理界面。该界面移除了所有语音交互功能，专注于提供配置管理、监控和调试功能。

## 功能特性

### 1. WebSocket 连接管理
- 连接/断开 WebSocket 服务器
- 实时连接状态显示
- 连接测试功能

### 2. 配置管理
- **语音配置**: 支持11种语音选项（英语、法语、意大利语、德语、西班牙语）
- **系统提示词配置**: 自定义AI助手的行为和响应风格
- **工具使用配置**: 配置外部集成（RAG、Agents、MCP等）
- **聊天历史配置**: 设置对话上下文和历史记录

### 3. 监控和统计
- **Token 使用统计**: 实时显示输入/输出Token数量
- **成本估算**: 基于Token使用量的成本预估
- **事件日志**: 详细的WebSocket事件记录和调试信息

### 4. 调试工具
- 实时事件流显示
- JSON格式的事件详情
- 事件清理和重置功能

## 安装和运行

### 1. 安装依赖
```bash
cd management
npm install
```

### 2. 启动开发服务器
```bash
npm start
```

应用将在 `http://localhost:3000` 启动

### 3. 生产构建
```bash
npm run build
```

## 使用指南

### 1. 连接配置
1. 在"WebSocket Server URL"字段中输入Python后端地址（默认: `ws://localhost:8081`）
2. 点击"Connect"按钮建立连接
3. 连接成功后状态会显示为已连接

### 2. 配置管理
切换到"Configuration"标签页进行配置：

#### 语音配置
- 选择合适的语音ID
- 支持多种语言和性别选项

#### 系统提示词
- 自定义AI助手的角色和行为
- 控制响应的长度和风格
- 设置对话的上下文

#### 工具配置
- 配置外部工具集成
- 支持JSON格式的工具定义
- 包含预定义的工具模板

#### 聊天历史
- 设置对话的初始上下文
- 支持多轮对话历史
- JSON格式的历史记录

### 3. 监控功能
- **Token统计**: 查看实时的Token使用情况
- **成本估算**: 监控API调用成本
- **事件日志**: 查看详细的通信记录

### 4. 调试工具
- 使用"Test Connection"测试WebSocket连接
- 查看"Event Log"标签页的详细事件信息
- 使用"Clear Events"清理日志
- 使用"Reset Meter"重置统计信息

## 配置示例

### 系统提示词示例
```
You are a friendly assistant. The user and you will engage in a spoken dialog exchanging the transcripts of a natural real-time conversation. Keep your responses short, generally two or three sentences for chatty scenarios.
```

### 工具配置示例
```json
{
  "tools": [
    {
      "toolSpec": {
        "name": "getDateTool",
        "description": "get information about the date and time",
        "inputSchema": {
          "json": "{\"type\":\"object\",\"properties\":{},\"required\":[]}"
        }
      }
    }
  ]
}
```

## 技术架构

### 前端技术栈
- **React 18**: 主要框架
- **AWS Cloudscape Design System**: UI组件库
- **WebSocket API**: 实时通信

### 组件结构
```
src/
├── components/
│   ├── meter.js          # Token统计组件
│   ├── meter.css         # 统计组件样式
│   ├── eventDisplay.js   # 事件显示组件
│   └── eventDisplay.css  # 事件显示样式
├── helper/
│   └── s2sEvents.js      # S2S事件工具类
├── App.js                # 主应用组件
└── index.js              # 应用入口
```

## 与Python后端集成

### WebSocket通信
- 使用标准WebSocket协议
- JSON格式的消息交换
- 支持双向实时通信

### 事件类型
- `sessionStart/sessionEnd`: 会话管理
- `promptStart/promptEnd`: 提示管理
- `contentStart/contentEnd`: 内容管理
- `textInput/textOutput`: 文本交互
- `toolUse/toolResult`: 工具调用
- `usageEvent`: 使用统计

## 故障排除

### 常见问题
1. **连接失败**: 检查Python后端是否运行，确认WebSocket地址正确
2. **配置不生效**: 确保JSON格式正确，重新连接后生效
3. **事件显示异常**: 清理事件日志，重新开始监控

### 调试建议
- 查看浏览器控制台的错误信息
- 检查WebSocket连接状态
- 验证JSON配置格式的正确性
- 使用事件日志分析通信问题

## 扩展功能

### 可添加的功能
1. **配置导入/导出**: 保存和加载配置文件
2. **历史记录管理**: 保存和回放对话历史
3. **性能监控**: 添加延迟和吞吐量监控
4. **批量测试**: 支持批量配置测试
5. **用户管理**: 多用户配置管理

### 自定义开发
- 修改`src/App.js`添加新功能
- 在`src/components/`中添加新组件
- 扩展`src/helper/s2sEvents.js`支持新事件类型

## 注意事项

1. **安全性**: 生产环境中应添加身份验证
2. **性能**: 大量事件日志可能影响性能，建议定期清理
3. **兼容性**: 确保与Python后端版本兼容
4. **网络**: WebSocket连接需要稳定的网络环境
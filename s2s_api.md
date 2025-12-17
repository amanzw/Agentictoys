# Nova Sonic 多设备管理系统 WebSocket API 接口文档

## 概述

本文档详细描述了客户端设备与 Nova Sonic 多设备管理系统之间的 API 接口定义和调用参数。系统支持多设备并发连接、用户认证、个性化配置和集中管理，提供双向流式语音对话功能。

**重要说明**: 本文档描述的是**客户端设备与增强Python服务器**之间的WebSocket通信协议，包括认证、设备管理和S2S事件处理。

## 服务器信息

### 连接配置
- **协议**: WebSocket (RFC 6455)
- **WebSocket 端口**: `ws://localhost:8081` (默认)
- **HTTP API 端口**: `http://localhost:8080` (管理接口)
- **消息格式**: JSON
- **编码**: UTF-8
- **连接类型**: 持久连接，支持多设备并发

### 环境变量配置
服务器启动时需要以下环境变量：

**AWS 配置**:
- `AWS_ACCESS_KEY_ID`: AWS访问密钥ID
- `AWS_SECRET_ACCESS_KEY`: AWS秘密访问密钥
- `AWS_DEFAULT_REGION`: AWS区域（默认: us-east-1）

**数据库配置** (必需):
- `DB_HOST`: PostgreSQL 数据库主机地址
- `DB_PORT`: 数据库端口（默认: 5432）
- `DB_NAME`: 数据库名称（默认: nova_sonic）
- `DB_USER`: 数据库用户名（默认: postgres）
- `DB_PASSWORD`: 数据库密码

**服务器配置**:
- `HOST`: 服务器主机地址（默认: localhost）
- `WS_PORT`: WebSocket端口（默认: 8081）
- `HTTP_PORT`: HTTP API端口（默认: 8080）

**集成服务配置** (可选):
- `KB_ID`: 知识库ID（启用RAG功能时）
- `KB_REGION`: 知识库区域
- `BOOKING_LAMBDA_ARN`: 预订Lambda函数ARN
- `AWS_PROFILE`: AWS配置文件名（MCP集成时）

### 启动参数
```bash
# 原版服务器 (单设备)
python server.py [--agent {mcp|strands}] [--debug]

# 增强版服务器 (多设备管理)
python enhanced_server.py [--agent {mcp|strands}] [--debug]
```
- `--agent mcp`: 启用MCP（Model Context Protocol）集成
- `--agent strands`: 启用Strands Agent集成
- `--debug`: 启用调试模式

**推荐使用**: `enhanced_server.py` 支持多设备管理、认证和数据库存储

## 消息协议

### 基本消息格式
所有WebSocket消息均为JSON格式，遵循以下结构：

**设备认证消息** (增强版新增):
```json
{
  "auth": {
    "username": "device",
    "password": "device123",
    "device_id": "device_001",
    "device_name": "Smart Speaker"
  }
}
```

**向后兼容设备注册**:
```json
{
  "device_id": "device_001",
  "device_name": "Smart Speaker"
}
```

**S2S 事件消息**:
```json
{
  "event": {
    "eventType": {
      // 事件特定参数
    }
  }
}
```

**认证响应消息** (增强版):
```json
// 认证成功
{
  "type": "auth_success",
  "token": "jwt_token_here",
  "device_id": "device_001",
  "config": {
    "voice_id": "matthew",
    "system_prompt": "You are a friendly assistant.",
    "enable_mcp": false
  }
}

// 认证失败
{
  "type": "auth_failed",
  "error": "Invalid credentials"
}
```

**S2S 事件响应**:
```json
{
  "event": {
    "eventType": {
      // 事件特定参数
    }
  },
  "timestamp": 1234567890123,
  "device_id": "device_001"  // 增强版新增
}
```

### 消息处理机制
1. 服务器接收客户端消息后，会解析JSON格式
2. 支持嵌套的body字段（兼容性处理）
3. 音频输入事件会被放入队列异步处理
4. 其他事件直接转发给Nova Sonic模型
5. 服务器响应会添加时间戳并转发给客户端

## 客户端发送事件（上行）

### 1. 会话管理事件

#### 1.1 sessionStart - 开始会话
**用途**: 初始化与Nova Sonic的对话会话
**时机**: 客户端连接后首先发送
**格式**:
```json
{
  "event": {
    "sessionStart": {
      "inferenceConfiguration": {
        "maxTokens": 1024,
        "topP": 0.95,
        "temperature": 0.7
      }
    }
  }
}
```

**参数说明**:
- `maxTokens`: 最大生成token数量（1-4096）
- `topP`: 核采样参数（0.0-1.0）
- `temperature`: 温度参数，控制随机性（0.0-1.0）

#### 1.2 sessionEnd - 结束会话
**用途**: 正常结束对话会话，清理资源
**时机**: 客户端断开连接前发送
**格式**:
```json
{
  "event": {
    "sessionEnd": {}
  }
}
```

### 2. 提示管理事件

#### 2.1 promptStart - 开始提示
**用途**: 配置对话提示的输出格式、语音设置和工具配置
**时机**: 会话开始后，发送内容前
**格式**:
```json
{
  "event": {
    "promptStart": {
      "promptName": "uuid-string",
      "textOutputConfiguration": {
        "mediaType": "text/plain"
      },
      "audioOutputConfiguration": {
        "mediaType": "audio/lpcm",
        "sampleRateHertz": 24000,
        "sampleSizeBits": 16,
        "channelCount": 1,
        "voiceId": "matthew",
        "encoding": "base64",
        "audioType": "SPEECH"
      },
      "toolUseOutputConfiguration": {
        "mediaType": "application/json"
      },
      "toolConfiguration": {
        "tools": [
          // 工具定义数组，见工具配置章节
        ]
      }
    }
  }
}
```

**参数说明**:
- `promptName`: 提示的唯一标识符，建议使用UUID
- `audioOutputConfiguration`: 音频输出配置
  - `sampleRateHertz`: 输出音频采样率（24000 Hz）
  - `voiceId`: 语音合成声音ID
- `toolConfiguration`: 可用工具的配置

**支持的语音ID**:
| 语音ID | 语言 | 性别 | 描述 |
|--------|------|------|------|
| `matthew` | English (US) | 男 | 美式英语，自然语调 |
| `tiffany` | English (US) | 女 | 美式英语，清晰发音 |
| `amy` | English (GB) | 女 | 英式英语，标准发音 |
| `ambre` | French | 女 | 法语，巴黎口音 |
| `florian` | French | 男 | 法语，标准发音 |
| `beatrice` | Italian | 女 | 意大利语，罗马口音 |
| `lorenzo` | Italian | 男 | 意大利语，标准发音 |
| `greta` | German | 女 | 德语，标准发音 |
| `lennart` | German | 男 | 德语，柏林口音 |
| `lupe` | Spanish | 女 | 西班牙语，马德里口音 |
| `carlos` | Spanish | 男 | 西班牙语，标准发音 |

#### 2.2 promptEnd - 结束提示
**用途**: 结束当前提示会话
**时机**: 对话结束时发送
**格式**:
```json
{
  "event": {
    "promptEnd": {
      "promptName": "uuid-string"
    }
  }
}
```

### 3. 内容管理事件

#### 3.1 contentStart - 开始内容
**用途**: 标记不同类型内容的开始

**文本内容（系统提示词、用户消息等）**:
```json
{
  "event": {
    "contentStart": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "type": "TEXT",
      "interactive": true,
      "role": "SYSTEM|USER|ASSISTANT",
      "textInputConfiguration": {
        "mediaType": "text/plain"
      }
    }
  }
}
```

**音频内容（语音输入流）**:
```json
{
  "event": {
    "contentStart": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "type": "AUDIO",
      "interactive": true,
      "audioInputConfiguration": {
        "mediaType": "audio/lpcm",
        "sampleRateHertz": 16000,
        "sampleSizeBits": 16,
        "channelCount": 1,
        "audioType": "SPEECH",
        "encoding": "base64"
      }
    }
  }
}
```

**工具结果内容（由服务器自动生成）**:
```json
{
  "event": {
    "contentStart": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "interactive": false,
      "type": "TOOL",
      "role": "TOOL",
      "toolResultInputConfiguration": {
        "toolUseId": "uuid-string",
        "type": "TEXT",
        "textInputConfiguration": {
          "mediaType": "text/plain"
        }
      }
    }
  }
}
```

**参数说明**:
- `promptName`: 关联的提示名称
- `contentName`: 内容的唯一标识符
- `type`: 内容类型（TEXT/AUDIO/TOOL）
- `interactive`: 是否为交互式内容
- `role`: 角色（SYSTEM/USER/ASSISTANT/TOOL）

#### 3.2 contentEnd - 结束内容
**用途**: 标记内容结束，触发处理
**格式**:
```json
{
  "event": {
    "contentEnd": {
      "promptName": "uuid-string",
      "contentName": "uuid-string"
    }
  }
}
```

### 4. 数据输入事件

#### 4.1 textInput - 文本输入
**用途**: 发送文本内容（系统提示词、用户消息、聊天历史等）
**格式**:
```json
{
  "event": {
    "textInput": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "content": "文本内容"
    }
  }
}
```

**使用场景**:
- 系统提示词设置
- 聊天历史记录
- 用户文本消息（如果支持）

#### 4.2 audioInput - 音频输入
**用途**: 发送实时音频数据流
**格式**:
```json
{
  "event": {
    "audioInput": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "content": "base64_encoded_pcm_data"
    }
  }
}
```

**音频格式严格要求**:
- **格式**: 线性PCM（Linear PCM）
- **采样率**: 16000 Hz（固定）
- **位深**: 16 bits（固定）
- **声道**: 单声道（Mono）
- **字节序**: 小端序（Little Endian）
- **编码**: Base64字符串
- **数据类型**: 有符号16位整数

**音频处理流程**:
1. 客户端采集音频（通常44.1kHz或48kHz）
2. 重采样到16kHz
3. 转换为16位PCM格式
4. Base64编码
5. 通过WebSocket发送

**JavaScript音频处理示例**:
```javascript
// 重采样和格式转换
const targetSampleRate = 16000;
const buffer = new ArrayBuffer(resampled.length * 2);
const pcmData = new DataView(buffer);

for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    pcmData.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
}

// 转换为Base64
let binary = '';
for (let i = 0; i < pcmData.byteLength; i++) {
    binary += String.fromCharCode(pcmData.getUint8(i));
}
const base64Audio = btoa(binary);
```

#### 4.3 toolResult - 工具结果（服务器内部使用）
**用途**: 服务器内部处理工具调用结果，客户端通常不直接发送
**格式**:
```json
{
  "event": {
    "toolResult": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "content": "工具执行结果"
    }
  }
}
```

## 服务器响应事件（下行）

### 1. textOutput - 文本输出
**用途**: 服务器返回AI生成的文本响应
**格式**:
```json
{
  "event": {
    "textOutput": {
      "role": "ASSISTANT",
      "content": "AI生成的文本内容",
      "contentId": "uuid-string"
    }
  },
  "timestamp": 1234567890123
}
```

**参数说明**:
- `role`: 固定为"ASSISTANT"
- `content`: 生成的文本内容，可能包含特殊控制信息
- `contentId`: 内容的唯一标识符
- `timestamp`: 服务器添加的时间戳（毫秒）

**特殊内容处理**:
- 如果content以"{"开头，可能包含中断信息：`{"interrupted": true}`

### 2. audioOutput - 音频输出
**用途**: 服务器返回AI生成的语音数据
**格式**:
```json
{
  "event": {
    "audioOutput": {
      "content": "base64_encoded_audio_data",
      "contentId": "uuid-string"
    }
  },
  "timestamp": 1234567890123
}
```

**音频格式**:
- **格式**: 线性PCM
- **采样率**: 24000 Hz
- **位深**: 16 bits
- **声道**: 单声道
- **编码**: Base64字符串

**客户端处理**:
```javascript
// 解码并播放音频
const base64Data = message.event.audioOutput.content;
const audioData = base64ToFloat32Array(base64Data);
audioPlayer.playAudio(audioData);
```

### 3. contentStart - 内容开始（服务器发送）
**用途**: 通知客户端新内容开始生成
**格式**:
```json
{
  "event": {
    "contentStart": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "type": "TEXT|AUDIO|TOOL",
      "role": "ASSISTANT|TOOL",
      "contentId": "uuid-string",
      "additionalModelFields": "{\"generationStage\": \"thinking\"}"
    }
  },
  "timestamp": 1234567890123
}
```

### 4. contentEnd - 内容结束（服务器发送）
**用途**: 通知客户端内容生成完成
**格式**:
```json
{
  "event": {
    "contentEnd": {
      "promptName": "uuid-string",
      "contentName": "uuid-string",
      "type": "TEXT|AUDIO|TOOL",
      "stopReason": "END_TURN|MAX_TOKENS|STOP_SEQUENCE"
    }
  },
  "timestamp": 1234567890123
}
```

### 5. toolUse - 工具使用通知
**用途**: 通知客户端AI正在调用工具
**格式**:
```json
{
  "event": {
    "toolUse": {
      "toolName": "getDateTool",
      "toolUseId": "uuid-string",
      "content": "{\"query\": \"用户查询内容\"}"
    }
  },
  "timestamp": 1234567890123
}
```

**支持的工具**:
- `getDateTool`: 获取当前日期时间
- `getKbTool`: 知识库查询（需要KB_ID环境变量）
- `getLocationTool`: 位置服务（需要MCP集成）
- `externalAgent`: 外部代理（需要Strands集成）
- `getBookingDetails`: 预订管理（需要Lambda ARN）

### 6. usageEvent - 使用统计
**用途**: 提供Token使用量和成本信息
**格式**:
```json
{
  "event": {
    "usageEvent": {
      "inputTokens": 123,
      "outputTokens": 456,
      "totalTokens": 579
    }
  },
  "timestamp": 1234567890123
}
```

**成本计算参考**:
- 输入Token成本: ~$0.00003 per token
- 输出Token成本: ~$0.00006 per token
- 实际成本请参考AWS官方定价

## 工具配置详解

工具配置在`promptStart`事件中的`toolConfiguration`字段中定义。每个工具都有标准的JSON Schema定义。

### 工具配置格式
```json
{
  "tools": [
    {
      "toolSpec": {
        "name": "工具名称",
        "description": "工具描述",
        "inputSchema": {
          "json": "JSON Schema字符串"
        }
      }
    }
  ]
}
```

### 内置工具详解

#### 1. getDateTool - 日期时间工具
**功能**: 获取当前UTC时间和日期
**依赖**: 无
**配置**:
```json
{
  "toolSpec": {
    "name": "getDateTool",
    "description": "get information about the current day",
    "inputSchema": {
      "json": "{\"type\":\"object\",\"properties\":{},\"required\":[]}"
    }
  }
}
```
**返回格式**: "Monday, 2024-01-15 14-30-25"

#### 2. getKbTool - 知识库查询工具
**功能**: 基于Amazon Bedrock Knowledge Bases的RAG查询
**依赖**: 需要设置`KB_ID`和`KB_REGION`环境变量
**配置**:
```json
{
  "toolSpec": {
    "name": "getKbTool",
    "description": "get information about Amazon Nova, Nova Sonic and Amazon foundation models",
    "inputSchema": {
      "json": "{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\",\"description\":\"The question about Amazon Nova\"}},\"required\":[\"query\"]}"
    }
  }
}
```
**使用示例**: "What is Amazon Nova Sonic?"

#### 3. getLocationTool - 位置服务工具
**功能**: 通过MCP协议访问AWS Location Services
**依赖**: 需要启动参数`--agent mcp`和`AWS_PROFILE`环境变量
**配置**:
```json
{
  "toolSpec": {
    "name": "getLocationTool",
    "description": "Search for places, addresses, or nearby points of interest",
    "inputSchema": {
      "json": "{\"type\":\"object\",\"properties\":{\"tool\":{\"type\":\"string\",\"description\":\"Function name: search_places, get_place, search_nearby, reverse_geocode\"},\"query\":{\"type\":\"string\",\"description\":\"Search query\"}},\"required\":[\"query\"]}"
    }
  }
}
```
**支持的操作**:
- `search_places`: 搜索地点
- `get_place`: 获取地点详情
- `search_nearby`: 搜索附近地点
- `reverse_geocode`: 反向地理编码

#### 4. externalAgent - 外部代理工具
**功能**: 通过Strands Agent获取天气信息
**依赖**: 需要启动参数`--agent strands`
**配置**:
```json
{
  "toolSpec": {
    "name": "externalAgent",
    "description": "Get weather information for specific locations",
    "inputSchema": {
      "json": "{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\",\"description\":\"Weather query\"}},\"required\":[\"query\"]}"
    }
  }
}
```
**使用示例**: "What's the weather like in Seattle today?"

#### 5. getBookingDetails - 预订管理工具
**功能**: 通过Bedrock Agents管理预订和预约
**依赖**: 需要设置`BOOKING_LAMBDA_ARN`环境变量
**配置**:
```json
{
  "toolSpec": {
    "name": "getBookingDetails",
    "description": "Manage bookings and reservations: create, get, update, delete, list",
    "inputSchema": {
      "json": "{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\",\"description\":\"Booking request\"}},\"required\":[\"query\"]}"
    }
  }
}
```
**支持的操作**:
- 创建预订: "Make a booking for John for May 25th at 7 p.m."
- 查询预订: "Check bookings for John"
- 更新预订: "Update the booking to May 25th at 7:30 p.m."
- 取消预订: "Cancel the booking"

### 工具调用流程
1. AI检测到需要使用工具
2. 服务器发送`toolUse`事件给客户端
3. 服务器内部执行工具调用
4. 服务器自动发送`contentStart`（TOOL类型）
5. 服务器发送`toolResult`事件
6. 服务器发送`contentEnd`事件
7. AI基于工具结果继续生成响应

## 完整的对话流程示例

### 典型的客户端-服务器交互序列

```
客户端 → 服务器: WebSocket连接建立
客户端 → 服务器: sessionStart
客户端 → 服务器: promptStart (配置语音、工具等)
客户端 → 服务器: contentStart (TEXT, SYSTEM)
客户端 → 服务器: textInput (系统提示词)
客户端 → 服务器: contentEnd
客户端 → 服务器: contentStart (AUDIO, USER)
客户端 → 服务器: audioInput (持续发送音频流)
客户端 → 服务器: contentEnd (用户说话结束)

服务器 → 客户端: contentStart (TEXT, ASSISTANT)
服务器 → 客户端: textOutput (AI文本响应)
服务器 → 客户端: contentEnd
服务器 → 客户端: contentStart (AUDIO, ASSISTANT)
服务器 → 客户端: audioOutput (AI语音响应)
服务器 → 客户端: contentEnd
服务器 → 客户端: usageEvent (Token统计)

客户端 → 服务器: promptEnd
客户端 → 服务器: sessionEnd
客户端 → 服务器: WebSocket连接关闭
```

### 工具调用流程示例

```
用户说话: "今天是几号？"

服务器 → 客户端: toolUse {"toolName": "getDateTool", ...}
服务器内部: 执行日期查询
服务器 → 客户端: contentStart (TOOL)
服务器 → 客户端: toolResult {"content": "Monday, 2024-01-15 14-30-25"}
服务器 → 客户端: contentEnd
服务器 → 客户端: contentStart (TEXT, ASSISTANT)
服务器 → 客户端: textOutput {"content": "今天是2024年1月15日，星期一。"}
服务器 → 客户端: contentEnd
服务器 → 客户端: audioOutput (语音: "今天是2024年1月15日，星期一。")
```

## 错误处理和异常情况

### 连接错误
- **WebSocket连接失败**: 检查服务器地址和端口
- **认证失败**: 检查AWS凭证配置
- **连接中断**: 客户端应实现重连机制

### 消息格式错误
```json
{
  "error": "Invalid JSON received from WebSocket",
  "timestamp": 1234567890123
}
```

### 音频格式错误
- 采样率不正确（必须16kHz）
- Base64编码错误
- PCM格式不正确

### 工具调用错误
```json
{
  "event": {
    "toolResult": {
      "promptName": "uuid",
      "contentName": "uuid",
      "content": "{\"result\": \"An error occurred while attempting to retrieve information related to the toolUse event.\"}"
    }
  }
}
```

## 性能优化建议

### 音频流优化
- 使用适当的缓冲区大小（建议512-1024样本）
- 实现音频压缩（如果网络带宽有限）
- 避免频繁的小数据包发送

### 连接管理
- 实现心跳机制检测连接状态
- 优雅处理连接断开和重连
- 使用连接池管理多个会话

### 内存管理
- 及时清理音频缓冲区
- 限制事件历史记录数量
- 使用流式处理避免大内存占用

## 开发实现指南

### JavaScript/TypeScript 实现

```javascript
class NovaS2SClient {
    constructor(serverUrl = 'ws://localhost:8081') {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.promptName = null;
        this.audioContentName = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.serverUrl);
            
            this.socket.onopen = () => {
                console.log('Connected to Nova S2S server');
                resolve();
            };
            
            this.socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleServerMessage(message);
            };
            
            this.socket.onerror = (error) => {
                reject(error);
            };
        });
    }

    startSession(config = {}) {
        this.promptName = crypto.randomUUID();
        this.audioContentName = crypto.randomUUID();
        
        // 发送会话开始
        this.sendEvent({
            event: {
                sessionStart: {
                    inferenceConfiguration: {
                        maxTokens: config.maxTokens || 1024,
                        topP: config.topP || 0.95,
                        temperature: config.temperature || 0.7
                    }
                }
            }
        });
        
        // 配置提示
        this.sendEvent({
            event: {
                promptStart: {
                    promptName: this.promptName,
                    textOutputConfiguration: { mediaType: "text/plain" },
                    audioOutputConfiguration: {
                        mediaType: "audio/lpcm",
                        sampleRateHertz: 24000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        voiceId: config.voiceId || "matthew",
                        encoding: "base64",
                        audioType: "SPEECH"
                    },
                    toolUseOutputConfiguration: { mediaType: "application/json" },
                    toolConfiguration: config.tools || { tools: [] }
                }
            }
        });
    }

    sendAudio(audioData) {
        this.sendEvent({
            event: {
                audioInput: {
                    promptName: this.promptName,
                    contentName: this.audioContentName,
                    content: audioData
                }
            }
        });
    }

    sendEvent(event) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(event));
        }
    }

    handleServerMessage(message) {
        const eventType = Object.keys(message.event)[0];
        
        switch (eventType) {
            case 'textOutput':
                this.onTextOutput(message.event.textOutput);
                break;
            case 'audioOutput':
                this.onAudioOutput(message.event.audioOutput);
                break;
            case 'usageEvent':
                this.onUsageUpdate(message.event.usageEvent);
                break;
        }
    }

    // 重写这些方法来处理服务器响应
    onTextOutput(data) { console.log('Text:', data.content); }
    onAudioOutput(data) { console.log('Audio received'); }
    onUsageUpdate(data) { console.log('Usage:', data); }
}
```

### Python 客户端实现

```python
import asyncio
import websockets
import json
import uuid
import base64

class NovaS2SClient:
    def __init__(self, server_url="ws://localhost:8081"):
        self.server_url = server_url
        self.websocket = None
        self.prompt_name = None
        self.audio_content_name = None

    async def connect(self):
        self.websocket = await websockets.connect(self.server_url)
        print("Connected to Nova S2S server")

    async def start_session(self, config=None):
        if config is None:
            config = {}
            
        self.prompt_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        
        # 发送会话开始
        await self.send_event({
            "event": {
                "sessionStart": {
                    "inferenceConfiguration": {
                        "maxTokens": config.get("maxTokens", 1024),
                        "topP": config.get("topP", 0.95),
                        "temperature": config.get("temperature", 0.7)
                    }
                }
            }
        })
        
        # 配置提示
        await self.send_event({
            "event": {
                "promptStart": {
                    "promptName": self.prompt_name,
                    "textOutputConfiguration": {"mediaType": "text/plain"},
                    "audioOutputConfiguration": {
                        "mediaType": "audio/lpcm",
                        "sampleRateHertz": 24000,
                        "sampleSizeBits": 16,
                        "channelCount": 1,
                        "voiceId": config.get("voiceId", "matthew"),
                        "encoding": "base64",
                        "audioType": "SPEECH"
                    },
                    "toolUseOutputConfiguration": {"mediaType": "application/json"},
                    "toolConfiguration": config.get("tools", {"tools": []})
                }
            }
        })

    async def send_audio(self, audio_data):
        await self.send_event({
            "event": {
                "audioInput": {
                    "promptName": self.prompt_name,
                    "contentName": self.audio_content_name,
                    "content": base64.b64encode(audio_data).decode('utf-8')
                }
            }
        })

    async def send_event(self, event):
        if self.websocket:
            await self.websocket.send(json.dumps(event))

    async def listen(self):
        async for message in self.websocket:
            data = json.loads(message)
            await self.handle_server_message(data)

    async def handle_server_message(self, message):
        event_type = list(message["event"].keys())[0]
        
        if event_type == "textOutput":
            await self.on_text_output(message["event"]["textOutput"])
        elif event_type == "audioOutput":
            await self.on_audio_output(message["event"]["audioOutput"])
        elif event_type == "usageEvent":
            await self.on_usage_update(message["event"]["usageEvent"])

    async def on_text_output(self, data):
        print(f"Text: {data['content']}")

    async def on_audio_output(self, data):
        print("Audio received")

    async def on_usage_update(self, data):
        print(f"Usage: {data}")
```

## 重要注意事项

### 音频处理要求
1. **严格的格式要求**: 必须是16kHz, 16-bit, 单声道PCM
2. **实时处理**: 建议每32ms发送一次音频数据
3. **Base64编码**: 所有音频数据必须Base64编码
4. **字节序**: 使用小端序（Little Endian）

### ID管理
1. **UUID格式**: 所有ID字段建议使用UUID
2. **一致性**: 同一会话中的promptName必须保持一致
3. **唯一性**: 每个contentName必须唯一

### 错误处理
1. **网络重连**: 实现自动重连机制
2. **消息验证**: 验证JSON格式和必需字段
3. **超时处理**: 设置合理的超时时间
4. **资源清理**: 及时清理音频缓冲区和事件监听器

### 性能考虑
1. **并发限制**: 服务器支持多个并发连接
2. **内存管理**: 避免音频数据积累
3. **网络优化**: 使用适当的缓冲策略
4. **延迟优化**: 最小化音频处理延迟


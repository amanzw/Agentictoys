import React from 'react';
import { 
    AppLayout, 
    Container, 
    Header, 
    SpaceBetween, 
    FormField, 
    Select, 
    Textarea, 
    Button,
    Alert,
    ColumnLayout,
    Box,
    Modal,
    SideNavigation,
    BreadcrumbGroup,
    ContentLayout,
    StatusIndicator,
    Flashbar
} from '@cloudscape-design/components';
import S2sEvent from './helper/s2sEvents';
import Meter from './components/meter';
import EventDisplay from './components/eventDisplay';
import DeviceList from './components/DeviceList';
import Login from './components/Login';
import Register from './components/Register';
import UserManager from './components/UserManager';
import deviceApi from './services/deviceApi';
import { base64ToFloat32Array } from './helper/audioHelper';
import AudioPlayer from './helper/audioPlayer';

class App extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            // 认证状态
            isAuthenticated: deviceApi.isAuthenticated(),
            user: null,
            showRegister: false,
            appInitialized: false,
            
            // WebSocket连接状态
            connected: false,
            connecting: false,
            alert: null,
            notifications: [],
            
            // 导航状态
            activeNavItem: 'devices',
            
            // 配置项
            websocketUrl: `ws://${process.env.REACT_APP_PYTHON_HOST || 'localhost'}:${process.env.REACT_APP_PYTHON_WS_PORT || '8081'}`,
            configVoiceIdOption: { label: "Matthew (English US)", value: "matthew" },
            configSystemPrompt: S2sEvent.DEFAULT_SYSTEM_PROMPT,
            configToolUse: JSON.stringify(S2sEvent.DEFAULT_TOOL_CONFIG, null, 2),
            configChatHistory: JSON.stringify(S2sEvent.DEFAULT_CHAT_HISTORY, null, 2),
            
            // 模态框状态
            showTestModal: false,
            testMessage: '',
            
            // 统计信息
            showUsage: false,
            
            // 音频相关状态
            audioRecording: false,
            mediaRecorder: null,
            audioStream: null,
            
            // 聊天相关状态
            chatMessages: {},
            includeChatHistory: false,
            
            // 设备认证状态
            deviceAuthenticated: false,
            deviceUsername: '',
            devicePassword: '',
            deviceId: '',
            deviceName: ''
        };
        
        this.socket = null;
        this.meterRef = React.createRef();
        this.eventDisplayRef = React.createRef();
        this.audioPlayer = new AudioPlayer();
        this.stateRef = React.createRef();
    }
    
    componentDidMount() {
        this.stateRef.current = this.state;
        // 初始化音频播放器
        this.audioPlayer.start().catch(err => {
            console.error("Failed to initialize audio player:", err);
        });
        
        // 监听认证过期事件
        window.addEventListener('auth-expired', this.handleAuthExpired);
        
        // 延迟初始化以确保Cloudscape组件正确初始化
        setTimeout(() => {
            this.setState({ appInitialized: true });
        }, 500);
    }
    
    componentDidUpdate(prevProps, prevState) {
        this.stateRef.current = this.state;
    }
    
    componentWillUnmount() {
        this.audioPlayer.stop();
        this.stopAudioRecording();
        window.removeEventListener('auth-expired', this.handleAuthExpired);
    }

    connectWebSocket = () => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return;
        }

        this.setState({ connecting: true, alert: null });

        try {
            this.socket = new WebSocket(this.state.websocketUrl);
            
            this.socket.onopen = () => {
                // WebSocket connected
                this.setState({ 
                    connected: true, 
                    connecting: false,
                    alert: null 
                });
                
                // Send device authentication if credentials provided
                if (this.state.deviceUsername && this.state.devicePassword) {
                    this.authenticateDevice();
                }
            };

            this.socket.onmessage = (message) => {
                try {
                    const event = JSON.parse(message.data);
                    this.handleIncomingMessage(event);
                } catch (error) {
                    console.error("Failed to parse WebSocket message:", error);
                    this.setState({ alert: "Received invalid message format" });
                }
            };

            this.socket.onerror = (error) => {
                this.setState({ 
                    alert: "WebSocket connection error",
                    connecting: false,
                    connected: false 
                });
            };

            this.socket.onclose = () => {
                this.setState({ 
                    connected: false,
                    connecting: false
                });
            };
        } catch (error) {
            this.setState({ 
                alert: "Failed to connect: " + error.message,
                connecting: false,
                connected: false 
            });
        }
    };

    disconnectWebSocket = () => {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.stopAudioRecording();
        this.setState({ 
            connected: false, 
            connecting: false,
            promptName: null,
            audioContentName: null,
            chatMessages: {},
            deviceAuthenticated: false
        });
        if (this.meterRef.current) {
            this.meterRef.current.stop();
        }
    };

    handleIncomingMessage = (message) => {
        // 处理设备认证响应
        if (message.type === "auth_success") {
            this.setState({ 
                deviceAuthenticated: true,
                alert: null 
            });
            return;
        }
        
        if (message.type === "auth_failed") {
            this.setState({ 
                deviceAuthenticated: false,
                alert: "Device authentication failed: " + (message.error || "Invalid credentials")
            });
            return;
        }
        
        // 处理使用统计事件
        if (message.event && message.event.usageEvent) {
            if (this.meterRef.current) {
                this.meterRef.current.updateMeter(message);
                if (!this.state.showUsage) {
                    this.setState({ showUsage: true });
                }
            }
        }
        
        // 处理文本输出
        if (message.event && message.event.textOutput) {
            const eventType = "textOutput";
            const role = message.event[eventType].role;
            const content = message.event[eventType].content;
            const contentId = message.event[eventType].contentId;
            
            let chatMessages = { ...this.state.chatMessages };
            if (chatMessages[contentId]) {
                chatMessages[contentId] = {
                    ...chatMessages[contentId],
                    content: content,
                    role: role
                };
            }
            this.setState({ chatMessages });
        }
        
        // 处理内容开始
        if (message.event && message.event.contentStart) {
            const contentType = message.event.contentStart.type;
            const contentId = message.event.contentStart.contentId;
            const role = message.event.contentStart.role;
            
            if (contentType === "TEXT") {
                let chatMessages = { ...this.state.chatMessages };
                chatMessages[contentId] = {
                    content: "",
                    role: role
                };
                this.setState({ chatMessages });
            }
        }
        
        // 处理音频输出
        if (message.event && message.event.audioOutput) {
            try {
                const base64Data = message.event.audioOutput.content;
                const audioData = base64ToFloat32Array(base64Data);
                this.audioPlayer.playAudio(audioData);
            } catch (error) {
                console.error("Error processing audio chunk:", error);
            }
        }

        // 显示事件
        if (this.eventDisplayRef.current) {
            this.eventDisplayRef.current.displayEvent(message, "in");
        }
    };

    sendTestMessage = async () => {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.setState({ alert: "WebSocket not connected" });
            return;
        }

        try {
            // 生成唯一ID
            const promptName = `prompt_${Date.now()}`;
            const textContentName = `text_${Date.now()}`;
            const audioContentName = `audio_${Date.now()}`;
            
            // 获取当前配置
            const inferenceConfig = {
                maxTokens: 1024,
                topP: 0.95,
                temperature: 0.7
            };
            
            const audioOutputConfig = {
                ...S2sEvent.DEFAULT_AUDIO_OUTPUT_CONFIG,
                voiceId: this.state.configVoiceIdOption.value
            };
            
            let toolConfig;
            try {
                toolConfig = JSON.parse(this.state.configToolUse);
            } catch (e) {
                toolConfig = S2sEvent.DEFAULT_TOOL_CONFIG;
            }
            
            const systemPrompt = this.state.configSystemPrompt;
            
            // 发送事件序列
            const events = [
                S2sEvent.sessionStart(inferenceConfig),
                S2sEvent.promptStart(promptName, audioOutputConfig, toolConfig),
                S2sEvent.contentStartText(promptName, textContentName),
                S2sEvent.textInput(promptName, textContentName, systemPrompt),
                S2sEvent.contentEnd(promptName, textContentName),
                S2sEvent.contentStartAudio(promptName, audioContentName)
            ];
            
            // 逐个发送事件
            for (const event of events) {
                this.socket.send(JSON.stringify(event));
                
                if (this.eventDisplayRef.current) {
                    this.eventDisplayRef.current.displayEvent(event, "out");
                }
                
                // 等待一小段时间避免发送太快
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 发送聊天历史（如果启用）
            if (this.state.includeChatHistory) {
                try {
                    const chatHistory = JSON.parse(this.state.configChatHistory);
                    for (const chat of chatHistory) {
                        const chatHistoryContentName = `chat_${Date.now()}_${Math.random()}`;
                        const chatEvents = [
                            S2sEvent.contentStartText(promptName, chatHistoryContentName, chat.role),
                            S2sEvent.textInput(promptName, chatHistoryContentName, chat.content),
                            S2sEvent.contentEnd(promptName, chatHistoryContentName)
                        ];
                        
                        for (const event of chatEvents) {
                            this.socket.send(JSON.stringify(event));
                            
                            if (this.eventDisplayRef.current) {
                                this.eventDisplayRef.current.displayEvent(event, "out");
                            }
                            
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    }
                } catch (error) {
                    console.error("Failed to parse chat history:", error);
                }
            }
            
            // 发送测试消息（如果有）
            if (this.state.testMessage.trim()) {
                const testTextContentName = `test_text_${Date.now()}`;
                const testEvents = [
                    S2sEvent.contentStartText(promptName, testTextContentName),
                    S2sEvent.textInput(promptName, testTextContentName, this.state.testMessage),
                    S2sEvent.contentEnd(promptName, testTextContentName)
                ];
                
                for (const event of testEvents) {
                    this.socket.send(JSON.stringify(event));
                    
                    if (this.eventDisplayRef.current) {
                        this.eventDisplayRef.current.displayEvent(event, "out");
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // 启动计量器
            if (this.meterRef.current) {
                this.meterRef.current.start();
            }
            
            // 保存会话信息用于音频录制
            this.setState({ 
                showTestModal: false,
                testMessage: '',
                showUsage: true,
                promptName: promptName,
                audioContentName: audioContentName
            });
        } catch (error) {
            this.setState({ alert: "Failed to send test message: " + error.message });
        }
    };

    clearEvents = () => {
        if (this.eventDisplayRef.current) {
            this.eventDisplayRef.current.cleanup();
        }
    };

    resetMeter = () => {
        if (this.meterRef.current) {
            this.meterRef.current.start();
        }
    };
    
    startAudioRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive'
            });
            
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(512, 1, 1);
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            const targetSampleRate = 16000;
            
            processor.onaudioprocess = async (e) => {
                if (this.state.audioRecording && this.socket && this.socket.readyState === WebSocket.OPEN) {
                    const inputBuffer = e.inputBuffer;
                    
                    // Create an offline context for resampling
                    const offlineContext = new OfflineAudioContext({
                        numberOfChannels: 1,
                        length: Math.ceil(inputBuffer.duration * targetSampleRate),
                        sampleRate: targetSampleRate
                    });
                    
                    // Copy input to offline context buffer
                    const offlineSource = offlineContext.createBufferSource();
                    const monoBuffer = offlineContext.createBuffer(1, inputBuffer.length, inputBuffer.sampleRate);
                    monoBuffer.copyToChannel(inputBuffer.getChannelData(0), 0);
                    
                    offlineSource.buffer = monoBuffer;
                    offlineSource.connect(offlineContext.destination);
                    offlineSource.start(0);
                    
                    // Resample and get the rendered buffer
                    const renderedBuffer = await offlineContext.startRendering();
                    const resampled = renderedBuffer.getChannelData(0);
                    
                    // Convert to Int16 PCM
                    const buffer = new ArrayBuffer(resampled.length * 2);
                    const pcmData = new DataView(buffer);
                    
                    for (let i = 0; i < resampled.length; i++) {
                        const s = Math.max(-1, Math.min(1, resampled[i]));
                        pcmData.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                    }
                    
                    // Convert to binary string and base64 encode
                    const uint8Array = new Uint8Array(pcmData.buffer);
                    const binary = String.fromCharCode.apply(null, uint8Array);
                    
                    // Send audio data
                    const currentState = this.stateRef.current;
                    if (currentState.promptName && currentState.audioContentName) {
                        const event = S2sEvent.audioInput(
                            currentState.promptName,
                            currentState.audioContentName,
                            btoa(binary)
                        );
                        this.socket.send(JSON.stringify(event));
                        
                        if (this.eventDisplayRef.current) {
                            this.eventDisplayRef.current.displayEvent(event, "out");
                        }
                    }
                }
            };
            
            this.setState({
                audioRecording: true,
                audioStream: stream,
                audioProcessor: processor,
                audioSource: source
            });
            
            console.log('Audio recording started');
        } catch (error) {
            console.error('Error accessing microphone:', error);
            let errorMessage = "Failed to access microphone";
            if (error.name === 'NotAllowedError') {
                errorMessage = "Microphone access denied. Please allow microphone access and try again.";
            } else if (error.name === 'NotFoundError') {
                errorMessage = "No microphone found. Please connect a microphone and try again.";
            } else {
                errorMessage = "Failed to access microphone: " + error.message;
            }
            this.setState({ alert: errorMessage });
        }
    };
    
    stopAudioRecording = () => {
        if (this.state.audioStream) {
            this.state.audioStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.state.audioProcessor) {
            this.state.audioProcessor.disconnect();
        }
        
        if (this.state.audioSource) {
            this.state.audioSource.disconnect();
        }
        
        this.setState({
            audioRecording: false,
            audioStream: null,
            audioProcessor: null,
            audioSource: null
        });
        
        console.log('Audio recording stopped');
    };
    
    toggleAudioRecording = () => {
        if (this.state.audioRecording) {
            this.stopAudioRecording();
        } else {
            this.startAudioRecording();
        }
    };
    
    authenticateDevice = () => {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.setState({ alert: "WebSocket not connected" });
            return;
        }
        
        const deviceId = this.state.deviceId || `device_${Date.now()}`;
        const deviceName = this.state.deviceName || `Test Device ${deviceId.slice(-8)}`;
        
        const authData = {
            auth: {
                username: this.state.deviceUsername,
                password: this.state.devicePassword,
                device_id: deviceId,
                device_name: deviceName
            }
        };
        
        this.socket.send(JSON.stringify(authData));
        this.setState({ deviceId, deviceName });
    };

    getActivePageTitle = () => {
        switch(this.state.activeNavItem) {
            case 'devices': return '设备管理';
            case 'users': return '系统管理';
            case 'config': return '系统管理';
            case 'events': return '监控与日志';
            case 'settings': return '系统设置';
            default: return '设备管理';
        }
    };

    renderConfigurationContent = () => {
        const voiceOptions = [
            { label: "Matthew (English US)", value: "matthew" },
            { label: "Tiffany (English US)", value: "tiffany" },
            { label: "Amy (English GB)", value: "amy" },
            { label: "Ambre (French)", value: "ambre" },
            { label: "Florian (French)", value: "florian" },
            { label: "Beatrice (Italian)", value: "beatrice" },
            { label: "Lorenzo (Italian)", value: "lorenzo" },
            { label: "Greta (German)", value: "greta" },
            { label: "Lennart (German)", value: "lennart" },
            { label: "Lupe (Spanish)", value: "lupe"},
            { label: "Carlos (Spanish)", value: "carlos"}
        ];

        return (
            <Container>
                <SpaceBetween direction="vertical" size="l">
                    {this.state.alert && (
                        <Alert type="error" dismissible onDismiss={() => this.setState({ alert: null })}>
                            {this.state.alert}
                        </Alert>
                    )}
                    
                    <Container header={<Header variant="h4">模拟测试连接</Header>}>
                        <ColumnLayout columns={2}>
                            <FormField 
                                label="WebSocket Server URL"
                                description="用于管理端模拟测试和事件监控的连接地址"
                            >
                                <input
                                    type="text"
                                    value={this.state.websocketUrl}
                                    onChange={(e) => this.setState({ websocketUrl: e.target.value })}
                                    disabled={this.state.connected}
                                    style={{ 
                                        width: '100%', 
                                        padding: '8px', 
                                        border: '1px solid #ccc', 
                                        borderRadius: '4px' 
                                    }}
                                />
                            </FormField>
                            
                            <FormField 
                                label="设备认证"
                                description="设备用户名和密码（可选）"
                            >
                                <SpaceBetween direction="vertical" size="xs">
                                    <input
                                        type="text"
                                        placeholder="用户名"
                                        value={this.state.deviceUsername}
                                        onChange={(e) => this.setState({ deviceUsername: e.target.value })}
                                        disabled={this.state.connected}
                                        style={{ 
                                            width: '100%', 
                                            padding: '8px', 
                                            border: '1px solid #ccc', 
                                            borderRadius: '4px' 
                                        }}
                                    />
                                    <input
                                        type="password"
                                        placeholder="密码"
                                        value={this.state.devicePassword}
                                        onChange={(e) => this.setState({ devicePassword: e.target.value })}
                                        disabled={this.state.connected}
                                        style={{ 
                                            width: '100%', 
                                            padding: '8px', 
                                            border: '1px solid #ccc', 
                                            borderRadius: '4px' 
                                        }}
                                    />
                                </SpaceBetween>
                            </FormField>
                        
                        <Box>
                            <SpaceBetween direction="horizontal" size="s">
                                <StatusIndicator type={this.state.connected ? 'success' : 'error'}>
                                    {this.state.connected ? '已连接' : '未连接'}
                                </StatusIndicator>
                                
                                {this.state.deviceUsername && (
                                    <StatusIndicator type={this.state.deviceAuthenticated ? 'success' : 'error'}>
                                        {this.state.deviceAuthenticated ? '设备已认证' : '设备未认证'}
                                    </StatusIndicator>
                                )}
                                
                                {this.state.audioRecording && (
                                    <StatusIndicator type="in-progress">
                                        正在录音...
                                    </StatusIndicator>
                                )}
                                
                                <Button
                                    variant="primary"
                                    onClick={this.state.connected ? this.disconnectWebSocket : this.connectWebSocket}
                                    loading={this.state.connecting}
                                >
                                    {this.state.connected ? 'Disconnect' : 'Connect'}
                                </Button>
                                
                                <Button
                                    onClick={() => this.setState({ showTestModal: true })}
                                    disabled={!this.state.connected}
                                >
                                    Test Connection
                                </Button>
                                
                                <Button onClick={this.clearEvents}>
                                    Clear Events
                                </Button>
                                
                                <Button onClick={this.resetMeter}>
                                    Reset Meter
                                </Button>
                                
                                <Button
                                    variant={this.state.audioRecording ? "normal" : "primary"}
                                    onClick={this.toggleAudioRecording}
                                    disabled={!this.state.connected || !this.state.promptName}
                                >
                                    {this.state.audioRecording ? 'Stop Recording' : 'Start Recording'}
                                </Button>
                                
                                <Button
                                    onClick={() => this.audioPlayer.bargeIn()}
                                    disabled={!this.state.connected}
                                >
                                    Stop Audio
                                </Button>
                                
                                {this.state.deviceUsername && this.state.connected && !this.state.deviceAuthenticated && (
                                    <Button
                                        variant="primary"
                                        onClick={this.authenticateDevice}
                                    >
                                        Authenticate Device
                                    </Button>
                                )}
                            </SpaceBetween>
                        </Box>
                        
                        <Box>
                            <FormField label="聊天选项">
                                <SpaceBetween direction="horizontal" size="xs">
                                    <input
                                        type="checkbox"
                                        checked={this.state.includeChatHistory}
                                        onChange={(e) => this.setState({ includeChatHistory: e.target.checked })}
                                        style={{ marginRight: '8px' }}
                                    />
                                    <span>Include chat history in test</span>
                                </SpaceBetween>
                            </FormField>
                        </Box>
                        </ColumnLayout>
                    </Container>

                    {this.state.showUsage && (
                        <Meter ref={this.meterRef} />
                    )}
                    
                    {Object.keys(this.state.chatMessages).length > 0 && (
                        <Container header={<Header variant="h4">聊天消息</Header>}>
                            <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '10px' }}>
                                {Object.keys(this.state.chatMessages).map((key) => {
                                    const msg = this.state.chatMessages[key];
                                    return (
                                        <div key={key} style={{ 
                                            marginBottom: '10px', 
                                            padding: '8px', 
                                            backgroundColor: msg.role === 'USER' ? '#e3f2fd' : '#f3e5f5',
                                            borderRadius: '4px'
                                        }}>
                                            <strong>{msg.role}:</strong> {msg.content}
                                        </div>
                                    );
                                })}
                            </div>
                        </Container>
                    )}

                    <SpaceBetween direction="vertical" size="m">
                        <FormField label="Voice ID">
                            <Select
                                selectedOption={this.state.configVoiceIdOption}
                                onChange={({ detail }) =>
                                    this.setState({ configVoiceIdOption: detail.selectedOption })
                                }
                                options={voiceOptions}
                            />
                        </FormField>

                        <FormField 
                            label="System Prompt"
                            description="System prompt for the speech model"
                        >
                            <Textarea
                                onChange={({ detail }) => 
                                    this.setState({ configSystemPrompt: detail.value })
                                }
                                value={this.state.configSystemPrompt}
                                rows={5}
                            />
                        </FormField>

                        <FormField 
                            label="Tool Use Configuration"
                            description="Configuration for external integrations such as RAG and Agents"
                        >
                            <Textarea
                                onChange={({ detail }) => 
                                    this.setState({ configToolUse: detail.value })
                                }
                                value={this.state.configToolUse}
                                rows={15}
                            />
                        </FormField>

                        <FormField 
                            label="Chat History"
                            description="Sample chat history to resume conversation"
                        >
                            <Textarea
                                onChange={({ detail }) => 
                                    this.setState({ configChatHistory: detail.value })
                                }
                                value={this.state.configChatHistory}
                                rows={10}
                            />
                        </FormField>
                    </SpaceBetween>

                    <Modal
                        onDismiss={() => this.setState({ showTestModal: false })}
                        visible={this.state.showTestModal}
                        header="Test WebSocket Connection"
                        footer={
                            <Box float="right">
                                <SpaceBetween direction="horizontal" size="xs">
                                    <Button 
                                        variant="link" 
                                        onClick={() => this.setState({ showTestModal: false })}
                                    >
                                        Cancel
                                    </Button>
                                    <Button 
                                        variant="primary" 
                                        onClick={this.sendTestMessage}
                                    >
                                        Send Test
                                    </Button>
                                </SpaceBetween>
                            </Box>
                        }
                    >
                        <SpaceBetween direction="vertical" size="m">
                            <Box>
                                这将发送一个完整的会话序列来测试 WebSocket 连接和系统功能。包括：
                                <ul>
                                    <li>sessionStart - 会话开始</li>
                                    <li>promptStart - 提示开始（使用当前配置）</li>
                                    <li>textInput - 系统提示词</li>
                                    <li>contentStart - 音频内容开始</li>
                                </ul>
                                <strong>注意：</strong>测试成功后，您可以使用 "Start Recording" 按钮开始音频录制。如果提供了设备认证信息，系统将自动进行设备认证。
                            </Box>
                            <FormField label="测试消息（可选）">
                                <Textarea
                                    value={this.state.testMessage}
                                    onChange={({ detail }) => 
                                        this.setState({ testMessage: detail.value })
                                    }
                                    placeholder="输入测试消息，将作为用户输入发送..."
                                    rows={3}
                                />
                            </FormField>
                        </SpaceBetween>
                    </Modal>
                </SpaceBetween>
            </Container>
        );
    };

    handleLogin = (user) => {
        const loginNotificationId = 'login-success';
        this.setState({
            isAuthenticated: true,
            user: user,
            notifications: [{
                type: 'success',
                content: `欢迎回来，${user.username}！`,
                dismissible: true,
                id: loginNotificationId
            }]
        });
        
        // 4-5秒后自动消失
        setTimeout(() => {
            this.dismissNotification(loginNotificationId);
        }, 4500);
    };

    handleLogout = () => {
        deviceApi.logout();
        this.setState({
            isAuthenticated: false,
            user: null,
            connected: false,
            activeNavItem: 'devices',
            notifications: []
        });
        if (this.socket) {
            this.socket.close();
        }
    };
    
    handleAuthExpired = () => {
        console.log('处理认证过期事件');
        // 防止重复触发
        if (!this.state.isAuthenticated) {
            return;
        }
        
        const authExpiredId = 'auth-expired';
        this.setState({
            isAuthenticated: false,
            user: null,
            connected: false,
            activeNavItem: 'devices',
            notifications: [{
                type: 'warning',
                content: '登录已过期，请重新登录',
                dismissible: true,
                id: authExpiredId
            }]
        });
        
        // 4-5秒后自动消失
        setTimeout(() => {
            this.dismissNotification(authExpiredId);
        }, 4500);
        if (this.socket) {
            this.socket.close();
        }
    };

    addNotification = (notification) => {
        const id = Date.now().toString();
        this.setState({
            notifications: [...this.state.notifications, {
                ...notification,
                id: id
            }]
        });
        
        // 4-5秒后自动消失
        setTimeout(() => {
            this.dismissNotification(id);
        }, 4500);
    };
    


    dismissNotification = (id) => {
        this.setState({
            notifications: this.state.notifications.filter(n => n.id !== id)
        });
    };

    render() {

        // 如果未认证，显示登录/注册界面
        if (!this.state.isAuthenticated) {
            return this.state.showRegister ? 
                <Register 
                    onRegister={this.handleLogin}
                    onSwitchToLogin={() => this.setState({ showRegister: false })}
                /> : 
                <Login 
                    onLogin={this.handleLogin}
                    onSwitchToRegister={() => this.setState({ showRegister: true })}
                />;
        }

        const navigationItems = [
            { 
                type: 'section', 
                text: '设备管理',
                items: [
                    { type: 'link', text: '设备列表', href: '#devices' },
                ]
            },
            { 
                type: 'section', 
                text: '系统管理',
                items: [
                    { type: 'link', text: '用户管理', href: '#users' },
                    { type: 'link', text: '模拟测试', href: '#config' },
                ]
            },
            { 
                type: 'section', 
                text: '监控与日志',
                items: [
                    { type: 'link', text: '事件日志', href: '#events' },
                ]
            }
        ];

        const getBreadcrumbs = () => {
            switch(this.state.activeNavItem) {
                case 'devices':
                    return [
                        { text: '设备管理', href: '#' },
                        { text: '设备列表' }
                    ];
                case 'users':
                    return [
                        { text: '系统管理', href: '#' },
                        { text: '用户管理' }
                    ];
                case 'config':
                    return [
                        { text: '系统管理', href: '#' },
                        { text: '模拟测试' }
                    ];
                case 'events':
                    return [
                        { text: '监控与日志', href: '#' },
                        { text: '事件日志' }
                    ];
                default:
                    return [
                        { text: '设备管理', href: '#' },
                        { text: '设备列表' }
                    ];
            }
        };
        
        const breadcrumbs = getBreadcrumbs();

        const renderContent = () => {
            if (!this.state.appInitialized) {
                return (
                    <Box textAlign="center" padding="l">
                        <StatusIndicator type="loading">正在初始化...</StatusIndicator>
                    </Box>
                );
            }
            
            switch(this.state.activeNavItem) {
                case 'devices':
                    return <DeviceList onNotification={this.addNotification} />;
                case 'users':
                    return <UserManager onNotification={this.addNotification} />;
                case 'config':
                    return this.renderConfigurationContent();
                case 'events':
                    return <EventDisplay ref={this.eventDisplayRef} />;
                default:
                    return <DeviceList onNotification={this.addNotification} />;
            }
        };

        return (
            <AppLayout
                navigation={
                    <SideNavigation
                        header={{ text: 'Nova Sonic S2S Service 管理控制台', href: '#' }}
                        items={navigationItems}
                        activeHref={`#${this.state.activeNavItem}`}
                        onFollow={(event) => {
                            event.preventDefault();
                            const item = event.detail.href.replace('#', '');
                            this.setState({ activeNavItem: item });
                        }}
                    />
                }
                notifications={
                    <Flashbar
                        items={this.state.notifications}
                        onDismiss={(event) => this.dismissNotification(event.detail.id)}
                    />
                }
                breadcrumbs={
                    <BreadcrumbGroup items={breadcrumbs} />
                }
                content={
                    <ContentLayout
                        header={
                            <Header
                                variant="h1"
                                actions={
                                    <Button onClick={this.handleLogout}>
                                        退出登录{this.state.user?.username ? ` (${this.state.user.username})` : ''}
                                    </Button>
                                }
                            >
                                {this.getActivePageTitle()}
                            </Header>
                        }
                    >
                        {renderContent()}
                    </ContentLayout>
                }
            />
        );
    }
}

export default App;
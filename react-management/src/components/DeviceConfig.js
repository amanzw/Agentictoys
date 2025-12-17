import React, { useState, useEffect } from 'react';
import {
    SpaceBetween,
    FormField,
    Select,
    Textarea,
    Input,
    Checkbox,
    Button,
    Alert,
    Box,
    Multiselect,
    Tabs,
    Container,
    Header,
    ExpandableSection,
    ColumnLayout
} from '@cloudscape-design/components';
import deviceApi from '../services/deviceApi';
import McpServerManager from './McpServerManager';

const DeviceConfig = ({ deviceId, onClose }) => {
    const [config, setConfig] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [alert, setAlert] = useState(null);
    const [mcpServers, setMcpServers] = useState([]);
    const [showMcpManager, setShowMcpManager] = useState(false);
    const [activeTab, setActiveTab] = useState('basic');
    const [initialized, setInitialized] = useState(false);

    const voiceOptions = [
        { label: "Matthew (英语-美国-男声)", value: "matthew" },
        { label: "Tiffany (英语-美国-女声)", value: "tiffany" },
        { label: "Amy (英语-英国-女声)", value: "amy" },
        { label: "Ambre (法语-女声)", value: "ambre" },
        { label: "Florian (法语-男声)", value: "florian" },
        { label: "Beatrice (意大利语-女声)", value: "beatrice" },
        { label: "Lorenzo (意大利语-男声)", value: "lorenzo" },
        { label: "Greta (德语-女声)", value: "greta" },
        { label: "Lennart (德语-男声)", value: "lennart" },
        { label: "Lupe (西班牙语-女声)", value: "lupe"},
        { label: "Carlos (西班牙语-男声)", value: "carlos"}
    ];

    useEffect(() => {
        const initializeComponent = async () => {
            setLoading(true);
            try {
                await Promise.all([loadConfig(), loadMcpServers()]);
            } finally {
                setLoading(false);
                // 延迟设置初始化状态，确保DOM完全准备好
                setTimeout(() => {
                    setInitialized(true);
                }, 50);
            }
        };
        
        initializeComponent();
    }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadConfig = async () => {
        try {
            const deviceConfig = await deviceApi.getDeviceConfig(deviceId);
            setConfig(deviceConfig);
        } catch (error) {
            setAlert(`Failed to load config: ${error.message}`);
        }
    };

    const loadMcpServers = async () => {
        try {
            const servers = await deviceApi.getMcpServers();
            setMcpServers(servers);
        } catch (error) {
            console.error('Failed to load MCP servers:', error);
        }
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            await deviceApi.updateDeviceConfig(deviceId, config);
            setAlert('Configuration saved successfully');
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (error) {
            setAlert(`Failed to save config: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const updateConfig = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const selectedVoiceOption = voiceOptions.find(option => option.value === config.voice_id) || voiceOptions[0];

    if (loading || !initialized) {
        return <Box>正在加载配置...</Box>;
    }

    const renderBasicConfig = () => (
        <SpaceBetween direction="vertical" size="m">
            <Container header={<Header variant="h3">基本设置</Header>}>
                <SpaceBetween direction="vertical" size="s">
                    <FormField 
                        label="设备名称"
                        description="为设备设置一个易于识别的名称"
                    >
                        <Input
                            value={config.device_name || ''}
                            onChange={({ detail }) => updateConfig('device_name', detail.value)}
                            placeholder="例如：客厅音箱、办公室助手"
                        />
                    </FormField>

                    <FormField 
                        label="语音模型"
                        description="选择设备使用的语音合成声音"
                    >
                        <Select
                            selectedOption={selectedVoiceOption}
                            onChange={({ detail }) => updateConfig('voice_id', detail.selectedOption.value)}
                            options={voiceOptions}
                        />
                    </FormField>

                    <FormField 
                        label="系统提示词"
                        description="定义AI助手的角色和行为方式"
                    >
                        <Textarea
                            value={config.system_prompt || ''}
                            onChange={({ detail }) => updateConfig('system_prompt', detail.value)}
                            rows={5}
                            placeholder="你是一个友好的AI助手，专门帮助用户解决问题..."
                        />
                    </FormField>
                </SpaceBetween>
            </Container>

            <Container header={<Header variant="h3">模型参数</Header>}>
                <ColumnLayout columns={3}>
                    <FormField 
                        label="最大令牌数"
                        description="控制回复的最大长度"
                    >
                        <Input
                            type="number"
                            value={config.max_tokens || 1024}
                            onChange={({ detail }) => {
                                const value = parseInt(detail.value) || 1024;
                                updateConfig('max_tokens', value);
                            }}
                        />
                    </FormField>
                    <FormField 
                        label="温度值"
                        description="控制回复的创造性 (0.0-1.0)"
                    >
                        <Input
                            type="number"
                            step="0.1"
                            value={config.temperature || 0.7}
                            onChange={({ detail }) => {
                                const value = parseFloat(detail.value);
                                updateConfig('temperature', isNaN(value) ? 0.7 : value);
                            }}
                        />
                    </FormField>
                    <FormField 
                        label="Top P"
                        description="控制词汇选择的多样性 (0.0-1.0)"
                    >
                        <Input
                            type="number"
                            step="0.1"
                            value={config.top_p || 0.95}
                            onChange={({ detail }) => {
                                const value = parseFloat(detail.value);
                                updateConfig('top_p', isNaN(value) ? 0.95 : value);
                            }}
                        />
                    </FormField>
                </ColumnLayout>
            </Container>
        </SpaceBetween>
    );

    const renderToolsConfig = () => (
        <SpaceBetween direction="vertical" size="m">
            <Container header={<Header variant="h3">内置工具集成</Header>}>
                <SpaceBetween direction="vertical" size="s">
                    <ExpandableSection headerText="AWS Bedrock 知识库">
                        <SpaceBetween direction="vertical" size="s">
                            <Checkbox
                                checked={config.enable_kb || false}
                                onChange={({ detail }) => updateConfig('enable_kb', detail.checked)}
                            >
                                启用知识库查询功能
                            </Checkbox>
                            <Box variant="small" color="text-body-secondary">
                                连接到AWS Bedrock知识库，为AI提供专业领域知识支持
                            </Box>
                            {config.enable_kb && (
                                <FormField label="知识库ID">
                                    <Input
                                        value={config.kb_id || ''}
                                        onChange={({ detail }) => updateConfig('kb_id', detail.value)}
                                        placeholder="输入Bedrock知识库ID"
                                    />
                                </FormField>
                            )}
                        </SpaceBetween>
                    </ExpandableSection>

                    <ExpandableSection headerText="AWS Bedrock Agents">
                        <SpaceBetween direction="vertical" size="s">
                            <Checkbox
                                checked={config.enable_agents || false}
                                onChange={({ detail }) => updateConfig('enable_agents', detail.checked)}
                            >
                                启用Bedrock智能代理
                            </Checkbox>
                            <Box variant="small" color="text-body-secondary">
                                集成AWS Bedrock Agents，提供复杂任务处理和业务流程自动化
                            </Box>
                            {config.enable_agents && (
                                <FormField label="Lambda函数ARN">
                                    <Input
                                        value={config.lambda_arn || ''}
                                        onChange={({ detail }) => updateConfig('lambda_arn', detail.value)}
                                        placeholder="输入Lambda函数的ARN"
                                    />
                                </FormField>
                            )}
                        </SpaceBetween>
                    </ExpandableSection>

                    <ExpandableSection headerText="Strands 天气代理">
                        <SpaceBetween direction="vertical" size="s">
                            <Checkbox
                                checked={config.enable_strands || false}
                                onChange={({ detail }) => updateConfig('enable_strands', detail.checked)}
                            >
                                启用Strands天气查询
                            </Checkbox>
                            <Box variant="small" color="text-body-secondary">
                                集成Strands服务，提供实时天气信息查询功能
                            </Box>
                        </SpaceBetween>
                    </ExpandableSection>

                    <ExpandableSection headerText="传统MCP支持">
                        <SpaceBetween direction="vertical" size="s">
                            <Checkbox
                                checked={config.enable_mcp || false}
                                onChange={({ detail }) => updateConfig('enable_mcp', detail.checked)}
                            >
                                启用传统MCP位置服务
                            </Checkbox>
                            <Box variant="small" color="text-body-secondary">
                                启用传统的Model Context Protocol位置查询服务（向后兼容）
                            </Box>
                        </SpaceBetween>
                    </ExpandableSection>
                </SpaceBetween>
            </Container>
        </SpaceBetween>
    );

    const renderMcpConfig = () => (
        <SpaceBetween direction="vertical" size="m">
            <Container header={<Header variant="h3">动态MCP服务器配置</Header>}>
                <SpaceBetween direction="vertical" size="s">
                    <Box variant="p">
                        Model Context Protocol (MCP) 允许您为设备添加自定义的外部工具和服务。
                        每个MCP服务器可以提供特定的功能，如文件操作、API调用、数据库查询等。
                    </Box>
                    
                    <Box float="right">
                        <Button variant="primary" onClick={() => {
                            // 确保有足够的延迟来避免GridNavigationProcessor错误
                            setTimeout(() => setShowMcpManager(true), 150);
                        }}>
                            管理MCP服务器
                        </Button>
                    </Box>
                    
                    <FormField 
                        label="选择MCP服务器"
                        description="为此设备选择要启用的MCP服务器"
                    >
                        <Multiselect
                            selectedOptions={(config.mcp_servers || []).map(server => ({
                                label: server.name,
                                value: server.id
                            }))}
                            onChange={({ detail }) => {
                                const selectedServers = detail.selectedOptions.map(option => 
                                    mcpServers.find(server => server.id === option.value)
                                ).filter(Boolean);
                                updateConfig('mcp_servers', selectedServers);
                            }}
                            options={mcpServers.map(server => ({
                                label: `${server.name} (${server.tool_name || '未命名工具'})`,
                                value: server.id,
                                description: server.description || '无描述'
                            }))}
                            placeholder="选择要启用的MCP服务器"
                        />
                    </FormField>

                    {(config.mcp_servers || []).length > 0 && (
                        <Container header={<Header variant="h4">已选择的MCP服务器</Header>}>
                            <SpaceBetween direction="vertical" size="s">
                                {(config.mcp_servers || []).map((server, index) => (
                                    <Box key={index}>
                                        <strong>{server.name}</strong> - {server.tool_name}
                                        <Box variant="small" color="text-body-secondary">
                                            连接类型: {server.connection_type?.toUpperCase()}
                                            {server.description && ` | ${server.description}`}
                                        </Box>
                                    </Box>
                                ))}
                            </SpaceBetween>
                        </Container>
                    )}
                </SpaceBetween>
            </Container>
        </SpaceBetween>
    );

    return (
        <SpaceBetween direction="vertical" size="m">
            {alert && (
                <Alert
                    type={alert.includes('successfully') ? 'success' : 'error'}
                    dismissible
                    onDismiss={() => setAlert(null)}
                >
                    {alert}
                </Alert>
            )}

            <Tabs
                activeTabId={activeTab}
                onChange={({ detail }) => setActiveTab(detail.activeTabId)}
                tabs={[
                    {
                        id: 'basic',
                        label: '基本配置',
                        content: renderBasicConfig()
                    },
                    {
                        id: 'tools',
                        label: '内置工具',
                        content: renderToolsConfig()
                    },
                    {
                        id: 'mcp',
                        label: 'MCP服务器',
                        content: renderMcpConfig()
                    }
                ]}
            />

            <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                    <Button onClick={onClose}>取消</Button>
                    <Button variant="primary" onClick={saveConfig} loading={saving}>
                        保存配置
                    </Button>
                </SpaceBetween>
            </Box>
            
            <McpServerManager 
                visible={showMcpManager}
                onClose={() => {
                    setShowMcpManager(false);
                    loadMcpServers();
                }}
            />
        </SpaceBetween>
    );
};

export default DeviceConfig;
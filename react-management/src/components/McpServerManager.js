import React, { useState, useEffect } from 'react';
import {
    SpaceBetween,
    Table,
    Button,
    Modal,
    FormField,
    Input,
    Textarea,
    Alert,
    Box,
    Select
} from '@cloudscape-design/components';
import deviceApi from '../services/deviceApi';

const McpServerManager = ({ visible, onClose }) => {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingServer, setEditingServer] = useState(null);
    const [alert, setAlert] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        connection_type: 'stdio',
        command: '',
        args: '[]',
        env_vars: '{}',
        url: '',
        headers: '{}',
        description: '',
        tool_name: '',
        tool_description: ''
    });

    const connectionTypes = [
        { label: 'STDIO (Local Process)', value: 'stdio' },
        { label: 'SSE (Server-Sent Events)', value: 'sse' },
        { label: 'HTTP (Streamable HTTP)', value: 'http' }
    ];

    useEffect(() => {
        if (visible) {
            setLoading(true);
            loadServers().finally(() => setLoading(false));
        }
    }, [visible]);

    const loadServers = async () => {
        try {
            const data = await deviceApi.getMcpServers();
            setServers(data);
        } catch (error) {
            setAlert(`Failed to load MCP servers: ${error.message}`);
        }
    };

    const handleSave = async () => {
        try {
            if (editingServer) {
                await deviceApi.updateMcpServer(editingServer.id, formData);
            } else {
                await deviceApi.createMcpServer(formData);
            }
            setAlert('MCP server saved successfully');
            setShowModal(false);
            await loadServers();
        } catch (error) {
            setAlert(`Failed to save MCP server: ${error.message}`);
        }
    };

    const handleDelete = async (serverId) => {
        if (!window.confirm('确定要删除这个MCP服务器吗？此操作不可恢复。')) {
            return;
        }
        
        try {
            await deviceApi.deleteMcpServer(serverId);
            setAlert('MCP server deleted successfully');
            await loadServers();
        } catch (error) {
            setAlert(`Failed to delete MCP server: ${error.message}`);
        }
    };

    const openModal = (server = null) => {
        setEditingServer(server);
        setFormData(server || {
            name: '',
            connection_type: 'stdio',
            command: '',
            args: '[]',
            env_vars: '{}',
            url: '',
            headers: '{}',
            description: '',
            tool_name: '',
            tool_description: ''
        });
        setShowModal(true);
    };

    return (
        <Modal
            visible={visible}
            onDismiss={onClose}
            header="MCP服务器管理"
            size="large"
        >
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

                <SpaceBetween direction="vertical" size="s">
                    <Box variant="p">
                        MCP (Model Context Protocol) 服务器允许您扩展AI助手的能力。
                        您可以添加各种类型的外部工具，如文件系统、API服务、数据库等。
                    </Box>
                    <Box float="right">
                        <Button variant="primary" onClick={() => openModal()}>
                            添加MCP服务器
                        </Button>
                    </Box>
                </SpaceBetween>

                {loading ? (
                    <Box textAlign="center" padding="l">
                        正在加载MCP服务器...
                    </Box>
                ) : servers.length === 0 ? (
                    <Box textAlign="center" padding="l">
                        暂无MCP服务器配置
                    </Box>
                ) : (
                    <SpaceBetween direction="vertical" size="s">
                        {servers.map((server, index) => (
                            <Box key={server.id || index} padding="s" variant="div">
                                <SpaceBetween direction="horizontal" size="m" alignItems="center">
                                    <Box>
                                        <strong>{server.name}</strong>
                                        <Box variant="small" color="text-body-secondary">
                                            {server.connection_type?.toUpperCase()} | {server.tool_name || '未命名'}
                                        </Box>
                                    </Box>
                                    <SpaceBetween direction="horizontal" size="xs">
                                        <Button size="small" onClick={() => openModal(server)}>编辑</Button>
                                        <Button size="small" onClick={() => handleDelete(server.id)}>删除</Button>
                                    </SpaceBetween>
                                </SpaceBetween>
                            </Box>
                        ))}
                    </SpaceBetween>
                )}

                <Modal
                    visible={showModal}
                    onDismiss={() => setShowModal(false)}
                    header={editingServer ? '编辑MCP服务器' : '添加MCP服务器'}
                    size="medium"
                >
                    <SpaceBetween direction="vertical" size="m">
                        <FormField 
                            label="服务器名称"
                            description="为MCP服务器设置一个易于识别的名称"
                        >
                            <Input
                                value={formData.name}
                                onChange={({ detail }) => setFormData({...formData, name: detail.value})}
                                placeholder="例如：文件系统工具、天气API服务"
                            />
                        </FormField>

                        <FormField 
                            label="连接类型"
                            description="选择MCP服务器的连接方式"
                        >
                            <Select
                                selectedOption={connectionTypes.find(t => t.value === formData.connection_type)}
                                onChange={({ detail }) => setFormData({...formData, connection_type: detail.selectedOption.value})}
                                options={connectionTypes}
                            />
                        </FormField>

                        {formData.connection_type === 'stdio' && (
                            <FormField 
                                label="命令"
                                description="启动MCP服务器的命令，如uvx、python等"
                            >
                                <Input
                                    value={formData.command}
                                    onChange={({ detail }) => setFormData({...formData, command: detail.value})}
                                    placeholder="uvx"
                                />
                            </FormField>
                        )}

                        {(formData.connection_type === 'sse' || formData.connection_type === 'http') && (
                            <FormField 
                                label="服务器URL"
                                description="MCP服务器的网络地址"
                            >
                                <Input
                                    value={formData.url}
                                    onChange={({ detail }) => setFormData({...formData, url: detail.value})}
                                    placeholder="http://localhost:3000/mcp 或 ws://localhost:3000/mcp"
                                />
                            </FormField>
                        )}

                        {formData.connection_type === 'stdio' && (
                            <>
                                <FormField 
                                    label="命令参数 (JSON数组)"
                                    description="传递给命令的参数列表"
                                >
                                    <Textarea
                                        value={formData.args}
                                        onChange={({ detail }) => setFormData({...formData, args: detail.value})}
                                        placeholder='["package@latest", "--option", "value"]'
                                        rows={3}
                                    />
                                </FormField>

                                <FormField 
                                    label="环境变量 (JSON对象)"
                                    description="设置进程的环境变量"
                                >
                                    <Textarea
                                        value={formData.env_vars}
                                        onChange={({ detail }) => setFormData({...formData, env_vars: detail.value})}
                                        placeholder='{"AWS_PROFILE": "default", "API_KEY": "your-key"}'
                                        rows={3}
                                    />
                                </FormField>
                            </>
                        )}

                        {(formData.connection_type === 'sse' || formData.connection_type === 'http') && (
                            <FormField 
                                label="HTTP请求头 (JSON对象)"
                                description="设置请求的HTTP头信息，如认证信息等"
                            >
                                <Textarea
                                    value={formData.headers}
                                    onChange={({ detail }) => setFormData({...formData, headers: detail.value})}
                                    placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                                    rows={3}
                                />
                            </FormField>
                        )}

                        <FormField 
                            label="工具名称"
                            description="AI助手调用此工具时使用的名称"
                        >
                            <Input
                                value={formData.tool_name}
                                onChange={({ detail }) => setFormData({...formData, tool_name: detail.value})}
                                placeholder="例如：fileManager、weatherAPI、databaseQuery"
                            />
                        </FormField>

                        <FormField 
                            label="工具功能描述"
                            description="告诉AI助手此工具的作用和使用场景"
                        >
                            <Input
                                value={formData.tool_description}
                                onChange={({ detail }) => setFormData({...formData, tool_description: detail.value})}
                                placeholder="例如：管理文件系统、查询天气信息、数据库操作"
                            />
                        </FormField>

                        <FormField 
                            label="详细说明"
                            description="对此MCP服务器的详细描述，供管理员参考"
                        >
                            <Textarea
                                value={formData.description}
                                onChange={({ detail }) => setFormData({...formData, description: detail.value})}
                                placeholder="请描述此服务器的功能、配置要求和使用注意事项..."
                                rows={3}
                            />
                        </FormField>

                        <Box float="right">
                            <SpaceBetween direction="horizontal" size="xs">
                                <Button onClick={() => setShowModal(false)}>取消</Button>
                                <Button variant="primary" onClick={handleSave}>保存</Button>
                            </SpaceBetween>
                        </Box>
                    </SpaceBetween>
                </Modal>
            </SpaceBetween>
        </Modal>
    );
};

export default McpServerManager;
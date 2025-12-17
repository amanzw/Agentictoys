import React, { useState, useEffect } from 'react';
import {
    Container,
    Header,
    Button,
    SpaceBetween,
    Box,
    Modal,
    Alert,
    StatusIndicator
} from '@cloudscape-design/components';
import deviceApi from '../services/deviceApi';
import DeviceConfig from './DeviceConfig';

const DeviceList = ({ onNotification }) => {
    const [devices, setDevices] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [alert, setAlert] = useState(null);
    const [initialized, setInitialized] = useState(false);

    const loadDevices = async () => {
        setLoading(true);
        try {
            const devicesData = await deviceApi.getDevices();
            setDevices(devicesData);
        } catch (error) {
            setAlert(`Failed to load devices: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // 延迟初始化以确保AppLayout完全渲染
        const timer = setTimeout(() => {
            setInitialized(true);
            loadDevices();
        }, 100);
        
        return () => clearTimeout(timer);
    }, []);

    // const handleDeviceAction = async (deviceId, action) => {
    //     try {
    //         await deviceApi.deviceAction(deviceId, action);
    //         setAlert(`Action ${action} executed for device ${deviceId}`);
    //         loadDevices();
    //     } catch (error) {
    //         setAlert(`Failed to execute action: ${error.message}`);
    //     }
    // };

    const openConfigModal = (deviceId) => {
        setSelectedDevice(deviceId);
        setShowConfigModal(true);
    };

    const closeConfigModal = () => {
        setSelectedDevice(null);
        setShowConfigModal(false);
        loadDevices();
    };

    const deviceItems = Object.entries(devices).map(([deviceId, device]) => {
        const enabledTools = [];
        if (device.enable_kb) enabledTools.push('知识库');
        if (device.enable_agents) enabledTools.push('Bedrock代理');
        if (device.enable_strands) enabledTools.push('天气查询');
        if (device.enable_mcp) enabledTools.push('传统MCP');
        if (device.mcp_servers && device.mcp_servers.length > 0) {
            enabledTools.push(`自定MCP(${device.mcp_servers.length})`); 
        }
        
        return {
            device_id: deviceId,
            device_name: device.device_name || '未命名设备',
            status: device.is_online ? 'online' : 'offline',
            last_seen: device.last_seen ? new Date(device.last_seen).toLocaleString() : '从未连接',
            voice_id: device.voice_id || 'matthew',
            tools: enabledTools.join(', ') || '无工具',
            mcp_count: device.mcp_servers ? device.mcp_servers.length : 0
        };
    });

    if (!initialized) {
        return (
            <Container header={<Header variant="h2">设备列表</Header>}>
                <Box textAlign="center" padding="l">
                    正在加载设备列表...
                </Box>
            </Container>
        );
    }

    return (
        <Container header={
            <Header 
                variant="h2" 
                description="管理和配置所有连接到Nova Sonic系统的设备"
                actions={
                    <Button 
                        onClick={loadDevices}
                        loading={loading}
                        iconName="refresh"
                    >
                        刷新
                    </Button>
                }
            >
                设备列表
            </Header>
        }>
            <SpaceBetween direction="vertical" size="m">
                {alert && (
                    <Alert
                        type="info"
                        dismissible
                        onDismiss={() => setAlert(null)}
                    >
                        {alert}
                    </Alert>
                )}

                {loading ? (
                    <Box textAlign="center" padding="l">
                        <StatusIndicator type="loading">正在加载设备...</StatusIndicator>
                    </Box>
                ) : deviceItems.length === 0 ? (
                    <Box textAlign="center" padding="l">
                        <b>暂无设备</b>
                        <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                            当前没有注册的设备。请启动设备客户端连接到服务器。
                        </Box>
                    </Box>
                ) : (
                    <SpaceBetween direction="vertical" size="s">
                        {deviceItems.map(item => (
                            <Container key={item.device_id}>
                                <SpaceBetween direction="vertical" size="s">
                                    <SpaceBetween direction="horizontal" size="m">
                                        <Box flex={1}>
                                            <strong>{item.device_name}</strong>
                                            <Box variant="small" color="text-body-secondary">
                                                ID: {item.device_id.substring(0, 12)}...
                                            </Box>
                                        </Box>
                                        <Box>
                                            <StatusIndicator type={item.status === 'online' ? 'success' : 'error'}>
                                                {item.status === 'online' ? '在线' : '离线'}
                                            </StatusIndicator>
                                            <Box variant="small" color="text-body-secondary">
                                                最后连接: {item.last_seen}
                                            </Box>
                                        </Box>
                                        <Box>
                                            <Box variant="small">语音: {item.voice_id}</Box>
                                        </Box>
                                        <Button onClick={() => openConfigModal(item.device_id)}>
                                            配置设备
                                        </Button>
                                    </SpaceBetween>
                                    <Box>
                                        <Box variant="small" color="text-body-secondary">
                                            已启用工具: {item.tools}
                                        </Box>
                                    </Box>
                                </SpaceBetween>
                            </Container>
                        ))}
                    </SpaceBetween>
                )}

                <Modal
                    onDismiss={closeConfigModal}
                    visible={showConfigModal}
                    header={`设备配置: ${selectedDevice ? devices[selectedDevice]?.device_name || selectedDevice : ''}`}
                    size="max"
                >
                    {selectedDevice && (
                        <DeviceConfig
                            deviceId={selectedDevice}
                            onClose={closeConfigModal}
                        />
                    )}
                </Modal>
            </SpaceBetween>
        </Container>
    );
};

export default DeviceList;
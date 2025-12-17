import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Container,
    Header,
    SpaceBetween,
    Button,
    Modal,
    FormField,
    Input,
    Select,
    Alert,
    Box,
    StatusIndicator,
    Badge,
    Table
} from '@cloudscape-design/components';
import deviceApi from '../services/deviceApi';

const UserManager = ({ onNotification }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const mountedRef = useRef(true);

    // 创建用户表单
    const [newUser, setNewUser] = useState({
        username: '',
        password: '',
        role: 'device_user'
    });

    // 修改密码表单
    const [passwordForm, setPasswordForm] = useState({
        username: '',
        old_password: '',
        new_password: ''
    });

    const loadUsers = useCallback(async (retryCount = 0) => {
        if (!mountedRef.current) return;
        
        setLoading(true);
        setError(null);
        
        try {
            console.log(`开始加载用户列表... (第${retryCount + 1}次尝试)`);
            console.log('认证状态:', deviceApi.isAuthenticated());
            console.log('API Base URL:', process.env.REACT_APP_API_URL || `http://${process.env.REACT_APP_PYTHON_HOST || 'localhost'}:${process.env.REACT_APP_PYTHON_HTTP_PORT || '8080'}`);
            
            // 检查认证状态
            if (!deviceApi.isAuthenticated()) {
                throw new Error('用户未登录，请先登录');
            }
            
            const response = await deviceApi.getUsers();
            console.log('用户列表响应:', response);
            console.log('响应类型:', typeof response, '是否为数组:', Array.isArray(response));
            
            if (mountedRef.current) {
                setUsers(Array.isArray(response) ? response : []);
                setError(null);
                console.log('用户列表加载成功，用户数量:', Array.isArray(response) ? response.length : 0);
            }
        } catch (error) {
            console.error('加载用户列表失败:', error);
            
            if (mountedRef.current) {
                // 如果是网络错误且重试次数少于3次，则自动重试
                if (retryCount < 2 && (error.message.includes('网络连接失败') || error.message.includes('请求超时'))) {
                    console.log(`网络错误，2秒后重试...`);
                    setTimeout(() => {
                        if (mountedRef.current) {
                            loadUsers(retryCount + 1);
                        }
                    }, 2000);
                    return;
                }
                
                setError(error.message || '加载失败');
                setUsers([]);
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                console.log('用户列表加载完成');
            }
        }
    }, []);

    useEffect(() => {
        console.log('UserManager组件初始化');
        mountedRef.current = true;
        
        if (!initialized) {
            setInitialized(true);
            loadUsers(0);
        }
        
        const handleRefresh = () => {
            if (mountedRef.current) {
                loadUsers(0);
            }
        };
        
        window.addEventListener('refresh-users', handleRefresh);
        
        return () => {
            mountedRef.current = false;
            window.removeEventListener('refresh-users', handleRefresh);
        };
    }, []);

    const handleCreateUser = async () => {
        if (!newUser.username || !newUser.password) {
            setError('用户名和密码不能为空');
            return;
        }

        try {
            await deviceApi.createUser(newUser);
            setSuccess('用户创建成功');
            setShowCreateModal(false);
            setNewUser({ username: '', password: '', role: 'device_user' });
            loadUsers(0);
            if (onNotification) {
                onNotification({
                    type: 'success',
                    content: `用户 ${newUser.username} 创建成功`,
                    dismissible: true
                });
            }
        } catch (error) {
            setError(error.message);
        }
    };

    const handleChangePassword = async () => {
        if (!passwordForm.username || !passwordForm.old_password || !passwordForm.new_password) {
            setError('所有字段都不能为空');
            return;
        }

        try {
            await deviceApi.changePassword(passwordForm);
            setSuccess('密码修改成功');
            setShowPasswordModal(false);
            setPasswordForm({ username: '', old_password: '', new_password: '' });
            if (onNotification) {
                onNotification({
                    type: 'success',
                    content: `用户 ${passwordForm.username} 的密码已修改`,
                    dismissible: true
                });
            }
        } catch (error) {
            setError(error.message);
        }
    };

    const handleDeleteUser = async (username) => {
        if (username === 'admin') {
            setError('不能删除管理员用户');
            return;
        }

        if (!window.confirm(`确定要删除用户 "${username}" 吗？此操作不可恢复。`)) {
            return;
        }

        try {
            await deviceApi.deleteUser(username);
            setSuccess('用户删除成功');
            loadUsers(0);
            if (onNotification) {
                onNotification({
                    type: 'success',
                    content: `用户 ${username} 已被删除`,
                    dismissible: true
                });
            }
        } catch (error) {
            setError(error.message);
        }
    };

    const roleOptions = [
        { label: '设备用户 - 可以连接设备到系统', value: 'device_user' },
        { label: '管理员 - 可以管理系统和用户', value: 'admin' }
    ];

    // 移除这个初始化检查，直接显示主要内容

    return (
        <Container>
            <SpaceBetween direction="vertical" size="l">
                <Header
                    variant="h2"
                    description="管理系统用户账户，包括管理员和设备用户"
                    actions={
                        <SpaceBetween direction="horizontal" size="xs">
                            <Button 
                                iconName="refresh" 
                                onClick={() => {
                                    console.log('手动刷新用户列表');
                                    setError(null);
                                    setSuccess(null);
                                    loadUsers(0);
                                }}
                                loading={loading}
                                disabled={loading}
                            >
                                {loading ? '加载中...' : '刷新'}
                            </Button>
                            <Button onClick={() => setShowPasswordModal(true)}>
                                修改密码
                            </Button>
                            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                                创建用户
                            </Button>
                        </SpaceBetween>
                    }
                >
                    用户管理
                </Header>

                {error && (
                    <Alert type="error" dismissible onDismiss={() => setError(null)}>
                        {error}
                    </Alert>
                )}
                


                {success && (
                    <Alert type="success" dismissible onDismiss={() => setSuccess(null)}>
                        {success}
                    </Alert>
                )}

                {loading ? (
                    <Box textAlign="center" padding="l">
                        <StatusIndicator type="loading">正在加载用户...</StatusIndicator>
                    </Box>
                ) : error ? (
                    <Box textAlign="center" padding="l">
                        <StatusIndicator type="error">加载失败</StatusIndicator>
                        <Box variant="p" color="text-body-secondary">
                            {error}
                        </Box>
                        <Button 
                            onClick={() => loadUsers(0)} 
                            variant="primary"
                            style={{ marginTop: '10px' }}
                        >
                            重试
                        </Button>
                    </Box>
                ) : users.length === 0 ? (
                    <Box textAlign="center" padding="l">
                        <b>暂无用户</b>
                        <Box variant="p" color="text-body-secondary">
                            系统中暂无用户账户，请创建第一个用户。
                        </Box>
                    </Box>
                ) : (
                    <SpaceBetween direction="vertical" size="m">
                        <Box variant="h3">用户列表 ({users.length}个用户)</Box>
                        {users.map(user => (
                            <Container key={user.username}>
                                <SpaceBetween direction="horizontal" size="m">
                                    <Box>
                                        <SpaceBetween direction="horizontal" size="xs">
                                            <Box variant="strong">{user.username}</Box>
                                            <Badge color={user.role === 'admin' ? 'red' : 'blue'}>
                                                {user.role === 'admin' ? '管理员' : '设备用户'}
                                            </Badge>
                                            {user.username === 'admin' && <Badge color="grey">默认</Badge>}
                                        </SpaceBetween>
                                        {user.last_login && (
                                            <Box variant="small" color="text-body-secondary">
                                                最后登录: {new Date(user.last_login).toLocaleString()}
                                            </Box>
                                        )}
                                    </Box>
                                    <Box float="right">
                                        {user.username !== 'admin' && (
                                            <Button 
                                                variant="normal" 
                                                iconName="remove"
                                                onClick={() => handleDeleteUser(user.username)}
                                            >
                                                删除
                                            </Button>
                                        )}
                                    </Box>
                                </SpaceBetween>
                            </Container>
                        ))}
                    </SpaceBetween>
                )}

                {/* Create User Modal */}
                <Modal
                    visible={showCreateModal}
                    onDismiss={() => setShowCreateModal(false)}
                    header="创建新用户"
                    footer={
                        <Box float="right">
                            <SpaceBetween direction="horizontal" size="xs">
                                <Button variant="link" onClick={() => setShowCreateModal(false)}>
                                    取消
                                </Button>
                                <Button variant="primary" onClick={handleCreateUser}>
                                    创建用户
                                </Button>
                            </SpaceBetween>
                        </Box>
                    }
                >
                    <SpaceBetween direction="vertical" size="m">
                        <FormField 
                            label="用户名"
                            description="设置用户的登录名称，不可重复"
                        >
                            <Input
                                value={newUser.username}
                                onChange={({ detail }) => setNewUser({...newUser, username: detail.value})}
                                placeholder="输入用户名"
                            />
                        </FormField>
                        <FormField 
                            label="密码"
                            description="设置用户的登录密码，建议使用强密码"
                        >
                            <Input
                                type="password"
                                value={newUser.password}
                                onChange={({ detail }) => setNewUser({...newUser, password: detail.value})}
                                placeholder="输入密码"
                            />
                        </FormField>
                        <FormField 
                            label="用户角色"
                            description="选择用户的权限级别"
                        >
                            <Select
                                selectedOption={roleOptions.find(opt => opt.value === newUser.role)}
                                onChange={({ detail }) => setNewUser({...newUser, role: detail.selectedOption.value})}
                                options={roleOptions}
                            />
                        </FormField>
                    </SpaceBetween>
                </Modal>

                {/* Change Password Modal */}
                <Modal
                    visible={showPasswordModal}
                    onDismiss={() => setShowPasswordModal(false)}
                    header="修改密码"
                    footer={
                        <Box float="right">
                            <SpaceBetween direction="horizontal" size="xs">
                                <Button variant="link" onClick={() => setShowPasswordModal(false)}>
                                    取消
                                </Button>
                                <Button variant="primary" onClick={handleChangePassword}>
                                    修改密码
                                </Button>
                            </SpaceBetween>
                        </Box>
                    }
                >
                    <SpaceBetween direction="vertical" size="m">
                        <FormField 
                            label="用户名"
                            description="输入要修改密码的用户名"
                        >
                            <Input
                                value={passwordForm.username}
                                onChange={({ detail }) => setPasswordForm({...passwordForm, username: detail.value})}
                                placeholder="输入用户名"
                            />
                        </FormField>
                        <FormField 
                            label="当前密码"
                            description="输入用户的当前密码进行验证"
                        >
                            <Input
                                type="password"
                                value={passwordForm.old_password}
                                onChange={({ detail }) => setPasswordForm({...passwordForm, old_password: detail.value})}
                                placeholder="输入当前密码"
                            />
                        </FormField>
                        <FormField 
                            label="新密码"
                            description="设置新的登录密码，建议使用强密码"
                        >
                            <Input
                                type="password"
                                value={passwordForm.new_password}
                                onChange={({ detail }) => setPasswordForm({...passwordForm, new_password: detail.value})}
                                placeholder="输入新密码"
                            />
                        </FormField>
                    </SpaceBetween>
                </Modal>
            </SpaceBetween>
        </Container>
    );
};

// 单独的表格组件
const UserTable = React.memo(({ users, onDeleteUser }) => {

    const columnDefinitions = React.useMemo(() => [
        {
            id: 'username',
            header: '用户名',
            cell: item => (
                <SpaceBetween direction="horizontal" size="xs">
                    <strong>{item.username}</strong>
                    {item.username === 'admin' && (
                        <Badge color="blue">默认</Badge>
                    )}
                </SpaceBetween>
            )
        },
        {
            id: 'role',
            header: '角色',
            cell: item => (
                <Badge color={item.role === 'admin' ? 'red' : 'blue'}>
                    {item.role === 'admin' ? '管理员' : '设备用户'}
                </Badge>
            )
        },
        {
            id: 'last_login',
            header: '最后登录',
            cell: item => item.last_login ? new Date(item.last_login).toLocaleString() : '从未登录'
        },
        {
            id: 'actions',
            header: '操作',
            cell: item => (
                <Button
                    variant="normal"
                    iconName="remove"
                    onClick={() => onDeleteUser && onDeleteUser(item.username)}
                    disabled={item.username === 'admin'}
                >
                    删除
                </Button>
            )
        }
    ], [onDeleteUser]);

    return (
        <Table
            columnDefinitions={columnDefinitions}
            items={users}
            variant="embedded"
            trackBy="username"
            empty={
                <Box textAlign="center" color="inherit">
                    <b>暂无用户</b>
                    <Box variant="p" color="inherit">
                        系统中暂无用户账户，请创建第一个用户。
                    </Box>
                </Box>
            }
        />
    );
});

export default UserManager;
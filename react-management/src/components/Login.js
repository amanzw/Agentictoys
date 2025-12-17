import React, { useState } from 'react';
import {
    Container,
    Header,
    SpaceBetween,
    FormField,
    Input,
    Button,
    Alert,
    Box,
    Link,
    Checkbox
} from '@cloudscape-design/components';
import deviceApi from '../services/deviceApi';

const Login = ({ onLogin, onSwitchToRegister }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            setError('用户名和密码不能为空');
            return;
        }
        
        setLoading(true);
        setError(null);
        
        try {
            const response = await deviceApi.login(username, password);
            if (response.success) {
                if (rememberMe) {
                    localStorage.setItem('remember_user', username);
                }
                onLogin(response.user);
            } else {
                setError('Invalid username or password');
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    };

    React.useEffect(() => {
        const rememberedUser = localStorage.getItem('remember_user');
        if (rememberedUser) {
            setUsername(rememberedUser);
            setRememberMe(true);
        }
    }, []);

    return (
        <Box 
            margin="xxl" 
            display="flex" 
            justifyContent="center" 
            alignItems="center" 
            minHeight="100vh"
            style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                minHeight: '100vh'
            }}
        >
            <Box
                padding="l"
                style={{
                    maxWidth: '400px',
                    width: '100%',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
            >
                <Container>
                <SpaceBetween direction="vertical" size="l">
                    <Box textAlign="center">
                        <Header variant="h1" description="Sign in to your account">
                            Nova Sonic
                        </Header>
                    </Box>
                    
                    {error && (
                        <Alert type="error" dismissible onDismiss={() => setError(null)}>
                            {error}
                        </Alert>
                    )}

                    <SpaceBetween direction="vertical" size="m">
                        <FormField label="Username">
                            <Input
                                value={username}
                                onChange={({ detail }) => setUsername(detail.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="Enter your username"
                            />
                        </FormField>

                        <FormField label="Password">
                            <Input
                                type="password"
                                value={password}
                                onChange={({ detail }) => setPassword(detail.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="Enter your password"
                            />
                        </FormField>

                        <Checkbox
                            checked={rememberMe}
                            onChange={({ detail }) => setRememberMe(detail.checked)}
                        >
                            Remember me
                        </Checkbox>

                        <Button
                            variant="primary"
                            onClick={handleLogin}
                            loading={loading}
                            fullWidth
                        >
                            Sign In
                        </Button>
                    </SpaceBetween>

                    <Box textAlign="center">
                        <SpaceBetween direction="vertical" size="s">
                            <Box variant="small" color="text-body-secondary">
                                请联系管理员获取登录凭据
                            </Box>
                            <Box variant="small" color="text-body-secondary">
                                Don't have an account?{' '}
                                <Link onFollow={onSwitchToRegister}>
                                    Create one here
                                </Link>
                            </Box>
                        </SpaceBetween>
                    </Box>
                </SpaceBetween>
                </Container>
            </Box>
        </Box>
    );
};

export default Login;
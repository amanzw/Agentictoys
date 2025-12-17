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
    Select,
    Link
} from '@cloudscape-design/components';
import deviceApi from '../services/deviceApi';

const Register = ({ onRegister, onSwitchToLogin }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        role: 'device_user'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [passwordStrength, setPasswordStrength] = useState('');

    const roleOptions = [
        { label: 'Device User', value: 'device_user' },
        { label: 'Administrator', value: 'admin' }
    ];

    const validatePassword = (password) => {
        if (password.length < 6) return 'weak';
        if (password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) return 'strong';
        return 'medium';
    };

    const handleInputChange = (field, value) => {
        setFormData({ ...formData, [field]: value });
        if (field === 'password') {
            setPasswordStrength(validatePassword(value));
        }
    };

    const handleRegister = async () => {
        if (!formData.username || !formData.password) {
            setError('Username and password are required');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters long');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await deviceApi.createUser({
                username: formData.username,
                password: formData.password,
                role: formData.role
            });

            if (response.success) {
                // Auto-login after registration
                const loginResponse = await deviceApi.login(formData.username, formData.password);
                if (loginResponse.success) {
                    onRegister(loginResponse.user);
                }
            } else {
                setError(response.message || 'Registration failed');
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    // const getPasswordStrengthColor = () => {
    //     switch (passwordStrength) {
    //         case 'weak': return 'error';
    //         case 'medium': return 'warning';
    //         case 'strong': return 'success';
    //         default: return 'info';
    //     }
    // };

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
                        <Header variant="h1" description="Create your Nova Sonic account">
                            Register
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
                                value={formData.username}
                                onChange={({ detail }) => handleInputChange('username', detail.value)}
                                placeholder="Enter username"
                            />
                        </FormField>

                        <FormField 
                            label="Password"
                            description={formData.password && `Password strength: ${passwordStrength}`}
                        >
                            <Input
                                type="password"
                                value={formData.password}
                                onChange={({ detail }) => handleInputChange('password', detail.value)}
                                placeholder="Enter password (min 6 characters)"
                            />
                        </FormField>

                        <FormField label="Confirm Password">
                            <Input
                                type="password"
                                value={formData.confirmPassword}
                                onChange={({ detail }) => handleInputChange('confirmPassword', detail.value)}
                                placeholder="Confirm your password"
                            />
                        </FormField>

                        <FormField label="Role">
                            <Select
                                selectedOption={roleOptions.find(opt => opt.value === formData.role)}
                                onChange={({ detail }) => handleInputChange('role', detail.selectedOption.value)}
                                options={roleOptions}
                            />
                        </FormField>

                        <Button
                            variant="primary"
                            onClick={handleRegister}
                            loading={loading}
                            fullWidth
                        >
                            Create Account
                        </Button>
                    </SpaceBetween>

                    <Box textAlign="center">
                        <Box variant="small" color="text-body-secondary">
                            Already have an account?{' '}
                            <Link onFollow={onSwitchToLogin}>
                                Sign in here
                            </Link>
                        </Box>
                    </Box>
                </SpaceBetween>
                </Container>
            </Box>
        </Box>
    );
};

export default Register;
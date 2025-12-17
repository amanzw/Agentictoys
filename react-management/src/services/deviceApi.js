const API_BASE_URL = process.env.REACT_APP_API_URL || `http://${process.env.REACT_APP_PYTHON_HOST || 'localhost'}:${process.env.REACT_APP_PYTHON_HTTP_PORT || '8080'}`;

class DeviceAPI {
    constructor() {
        this.token = localStorage.getItem('auth_token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }
    }

    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
            console.log('API请求带有认证token');
        } else {
            console.log('API请求未带认证token');
        }

        const fullUrl = `${API_BASE_URL}${url}`;
        console.log(`API请求: ${options.method || 'GET'} ${fullUrl}`);
        console.log('API请求头:', headers);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log('API请求超时，取消请求');
                controller.abort();
            }, 15000); // 增加到15秒超时
            
            const response = await fetch(fullUrl, {
                ...options,
                headers,
                mode: 'cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log(`API响应: ${response.status} ${response.statusText}`);

            if (response.status === 401) {
                console.log('认证失败，清除token并触发登出事件');
                this.setToken(null);
                // 触发全局登出事件
                window.dispatchEvent(new CustomEvent('auth-expired'));
                throw new Error('需要重新登录');
            }

            if (!response.ok) {
                let errorMessage = `HTTP错误: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    console.log('错误响应数据:', errorData);
                    if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (e) {
                    console.log('无法解析错误响应JSON:', e);
                    // 忽略JSON解析错误，使用默认错误消息
                }
                
                // 根据状态码提供更友好的错误信息
                if (response.status === 503) {
                    errorMessage = '服务暂时不可用，请稍后重试';
                } else if (response.status >= 500) {
                    errorMessage = '服务器内部错误，请联系管理员';
                } else if (response.status === 404) {
                    errorMessage = '请求的资源不存在';
                } else if (response.status === 403) {
                    errorMessage = '没有权限访问该资源';
                }
                
                console.log('最终错误消息:', errorMessage);
                throw new Error(errorMessage);
            }

            try {
                const data = await response.json();
                console.log('API响应数据:', data);
                return data;
            } catch (jsonError) {
                console.error('JSON解析错误:', jsonError);
                throw new Error('服务器返回了无效的数据格式');
            }
        } catch (error) {
            console.error('API请求失败:', error);
            if (error.name === 'AbortError') {
                throw new Error('请求超时 - 服务器响应时间过长');
            }
            if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
                throw new Error('网络连接失败 - 无法连接到服务器');
            }
            throw error;
        }
    }

    // 认证相关
    async login(username, password) {
        if (!username || !password) {
            throw new Error('Username and password are required');
        }
        
        try {
            const response = await this.request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            if (response.success) {
                this.setToken(response.token);
            }
            
            return response;
        } catch (error) {
            throw error;
        }
    }

    logout() {
        this.setToken(null);
    }

    // 设备管理
    async getDevices() {
        return this.request('/api/devices');
    }

    async getDeviceConfig(deviceId) {
        if (!deviceId) {
            throw new Error('Device ID is required');
        }
        return this.request(`/api/devices/${deviceId}`);
    }

    async updateDeviceConfig(deviceId, config) {
        if (!deviceId) {
            throw new Error('Device ID is required');
        }
        return this.request(`/api/devices/${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    async deviceAction(deviceId, action) {
        if (!deviceId) {
            throw new Error('Device ID is required');
        }
        return this.request(`/api/devices/${deviceId}/action`, {
            method: 'POST',
            body: JSON.stringify({ action })
        });
    }

    // MCP Server Management
    async getMcpServers() {
        return this.request('/api/mcp-servers');
    }

    async createMcpServer(serverData) {
        return this.request('/api/mcp-servers', {
            method: 'POST',
            body: JSON.stringify(serverData)
        });
    }

    async updateMcpServer(serverId, serverData) {
        if (!serverId) {
            throw new Error('Server ID is required');
        }
        return this.request(`/api/mcp-servers/${serverId}`, {
            method: 'PUT',
            body: JSON.stringify(serverData)
        });
    }

    async deleteMcpServer(serverId) {
        if (!serverId) {
            throw new Error('Server ID is required');
        }
        return this.request(`/api/mcp-servers/${serverId}`, {
            method: 'DELETE'
        });
    }

    // 用户管理
    async getUsers() {
        console.log('开始获取用户列表...');
        
        // 检查认证状态
        if (!this.isAuthenticated()) {
            console.error('用户未认证');
            throw new Error('需要重新登录');
        }
        
        try {
            const users = await this.request('/api/users');
            console.log('用户列表获取成功:', users);
            // 确保返回数组
            return Array.isArray(users) ? users : [];
        } catch (error) {
            console.error('获取用户列表失败:', error);
            throw error;
        }
    }

    async createUser(userData) {
        if (!userData.username || !userData.password) {
            throw new Error('用户名和密码不能为空');
        }
        return this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async changePassword(passwordData) {
        if (!passwordData.username || !passwordData.old_password || !passwordData.new_password) {
            throw new Error('所有字段都不能为空');
        }
        return this.request('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify(passwordData)
        });
    }

    async deleteUser(username) {
        if (!username) {
            throw new Error('用户名不能为空');
        }
        
        try {
            return await this.request(`/api/users/${encodeURIComponent(username)}`, {
                method: 'DELETE'
            });
        } catch (error) {
            if (error.message === '需要重新登录') {
                // 提示用户重新登录
                throw new Error('登录已过期，请重新登录后再试');
            }
            throw error;
        }
    }

    isAuthenticated() {
        const hasToken = !!this.token;
        console.log('检查认证状态:', {
            hasToken,
            tokenLength: this.token ? this.token.length : 0,
            tokenPreview: this.token ? this.token.substring(0, 20) + '...' : 'null'
        });
        return hasToken;
    }
}

const deviceApi = new DeviceAPI();
export default deviceApi;
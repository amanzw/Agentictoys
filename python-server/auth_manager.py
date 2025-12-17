import hashlib
import jwt
import time
import os
import bcrypt
from typing import Optional, Dict
from dataclasses import dataclass
from database import db_manager

@dataclass
class User:
    username: str
    password_hash: str
    role: str = "device_user"

class AuthManager:
    def __init__(self):
        self.sessions: Dict[str, dict] = {}
        self.secret_key = os.getenv("JWT_SECRET_KEY", "nova-sonic-secret-key")
    
    def _hash_password(self, password: str) -> str:
        """安全地哈希密码"""
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    def _verify_password(self, password: str, password_hash: str) -> bool:
        """验证密码"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
        except:
            # 兼容旧的SHA256哈希
            return hashlib.sha256(password.encode()).hexdigest() == password_hash
    
    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """验证用户"""
        user_data = await db_manager.get_user(username)
        if not user_data:
            return None
        
        if self._verify_password(password, user_data['password_hash']):
            await db_manager.update_user_login(username)
            return User(user_data['username'], user_data['password_hash'], user_data['role'])
        return None
    
    async def create_user(self, username: str, password: str, role: str = "device_user") -> bool:
        """创建新用户"""
        if not username or not password or len(password) < 6:
            return False
        
        if await db_manager.get_user(username):
            return False
        
        password_hash = self._hash_password(password)
        return await db_manager.create_user(username, password_hash, role)
    
    async def change_password(self, username: str, old_password: str, new_password: str) -> bool:
        """修改密码"""
        user_data = await db_manager.get_user(username)
        if not user_data:
            return False
        
        if not self._verify_password(old_password, user_data['password_hash']):
            return False
        
        new_password_hash = self._hash_password(new_password)
        return await db_manager.update_user_password(username, new_password_hash)
    
    def create_session(self, user: User, device_id: str = None) -> str:
        """创建会话"""
        payload = {
            "username": user.username,
            "role": user.role,
            "device_id": device_id,
            "exp": time.time() + 3600  # 1小时过期
        }
        token = jwt.encode(payload, self.secret_key, algorithm="HS256")
        
        self.sessions[token] = {
            "user": user,
            "device_id": device_id,
            "created_at": time.time()
        }
        
        return token
    
    def validate_session(self, token: str) -> Optional[dict]:
        """验证会话"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            if token in self.sessions:
                return self.sessions[token]
        except jwt.ExpiredSignatureError:
            if token in self.sessions:
                del self.sessions[token]
        except jwt.InvalidTokenError:
            pass
        
        return None
    
    def revoke_session(self, token: str) -> bool:
        """撤销会话"""
        if token in self.sessions:
            del self.sessions[token]
            return True
        return False
    
    def get_user_from_token(self, token: str) -> Optional[str]:
        """从token获取用户名"""
        session = self.validate_session(token)
        return session['user'].username if session else None
    
    def cleanup_expired_sessions(self):
        """清理过期会话"""
        current_time = time.time()
        expired_tokens = []
        
        for token, session in self.sessions.items():
            created_at = session.get('created_at', 0)
            if current_time > created_at + 3600:  # 1小时过期
                expired_tokens.append(token)
        
        for token in expired_tokens:
            del self.sessions[token]
        
        return len(expired_tokens)
    
    async def delete_user(self, username: str) -> bool:
        """删除用户"""
        if username == 'admin':
            return False
        return await db_manager.delete_user(username)
    
    async def delete_user_with_cleanup(self, username: str) -> bool:
        """删除用户并清理相关数据"""
        if username == 'admin':
            return False
        
        # 清理该用户的所有会话
        tokens_to_remove = []
        for token, session in self.sessions.items():
            if session['user'].username == username:
                tokens_to_remove.append(token)
        
        for token in tokens_to_remove:
            del self.sessions[token]
        
        return await db_manager.delete_user_with_cascade(username)
    
    async def validate_session_with_user_check(self, token: str) -> Optional[dict]:
        """验证会话并检查用户是否存在"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            if token in self.sessions:
                session = self.sessions[token]
                # 检查用户是否仍然存在于数据库中
                user_exists = await db_manager.get_user(session['user'].username)
                if not user_exists:
                    # 用户已被删除，清理会话
                    del self.sessions[token]
                    return None
                return session
        except jwt.ExpiredSignatureError:
            if token in self.sessions:
                del self.sessions[token]
        except jwt.InvalidTokenError:
            pass
        
        return None
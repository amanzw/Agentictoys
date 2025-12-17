# 改进的删除用户逻辑示例

@require_auth
async def delete_user(request):
    """删除用户（仅管理员）- 改进版本"""
    try:
        # 验证JSON请求体
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)
        
        user = request['user']
        if user.role != 'admin':
            return web.json_response({"error": "Admin access required"}, status=403)
        
        username = request.match_info['username']
        
        # 输入验证
        if not username or len(username.strip()) == 0:
            return web.json_response({"error": "Username is required"}, status=400)
        
        # 清理用户名用于日志记录（防止日志注入）
        safe_username = username.replace('\n', '').replace('\r', '')[:50]
        
        # 删除用户及其关联数据
        success = await auth_manager.delete_user_with_cleanup(username)
        
        if success:
            logger.info(f"User deleted successfully: {safe_username}")
            return web.json_response({"success": True, "message": "User deleted successfully"})
        else:
            logger.warning(f"Failed to delete user: {safe_username}")
            return web.json_response({"error": "Cannot delete admin user or user not found"}, status=400)
    except Exception as e:
        logger.error(f"Error deleting user: {type(e).__name__}")
        return web.json_response({"error": "Internal server error"}, status=500)

# 在 auth_manager.py 中添加
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
    
    # 删除用户及其关联数据
    return await db_manager.delete_user_with_cascade(username)

# 在 database.py 中添加
async def delete_user_with_cascade(self, username: str) -> bool:
    """删除用户及其关联数据"""
    if username == 'admin':
        return False
    
    async with self.pool.acquire() as conn:
        async with conn.transaction():
            try:
                # 获取用户ID
                user_id = await conn.fetchval("SELECT id FROM users WHERE username = $1", username)
                if not user_id:
                    return False
                
                # 删除关联的设备配置
                await conn.execute("DELETE FROM device_configs WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = $1)", user_id)
                
                # 删除关联的设备
                await conn.execute("DELETE FROM devices WHERE user_id = $1", user_id)
                
                # 删除关联的会话
                await conn.execute("DELETE FROM sessions WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = $1)", user_id)
                
                # 最后删除用户
                result = await conn.execute("DELETE FROM users WHERE id = $1", user_id)
                
                return result != "DELETE 0"
            except Exception as e:
                logger.error(f"Error in cascade delete: {e}")
                raise
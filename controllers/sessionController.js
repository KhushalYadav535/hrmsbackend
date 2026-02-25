const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * Session Management Controller
 * Tracks active sessions and allows force logout
 */

/** GET active sessions for current user */
exports.getMySessions = async (req, res) => {
    try {
        const user = await User.findById(req.user._id || req.user.id).select('activeSessions name email');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const sessions = (user.activeSessions || []).map(s => ({
            sessionId: s.sessionId,
            ipAddress: s.ipAddress,
            userAgent: s.userAgent,
            loginAt: s.loginAt,
            lastActivity: s.lastActivity,
            isCurrent: s.sessionId === req.headers['x-session-id'],
        }));

        res.json({ success: true, data: sessions, count: sessions.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** GET all active sessions (Admin) */
exports.getAllActiveSessions = async (req, res) => {
    try {
        const { tenantId } = req;
        const users = await User.find({ tenantId, 'activeSessions.0': { $exists: true } })
            .select('name email role activeSessions');

        const sessions = [];
        users.forEach(u => {
            (u.activeSessions || []).forEach(s => {
                sessions.push({
                    userId: u._id,
                    userName: u.name,
                    userEmail: u.email,
                    role: u.role,
                    sessionId: s.sessionId,
                    ipAddress: s.ipAddress,
                    userAgent: s.userAgent,
                    loginAt: s.loginAt,
                    lastActivity: s.lastActivity,
                });
            });
        });

        sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
        res.json({ success: true, data: sessions, count: sessions.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** FORCE LOGOUT a specific session */
exports.forceLogoutSession = async (req, res) => {
    try {
        const { userId, sessionId } = req.params;

        const user = await User.findOne({ _id: userId, tenantId: req.tenantId });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const before = (user.activeSessions || []).length;
        user.activeSessions = (user.activeSessions || []).filter(s => s.sessionId !== sessionId);
        await user.save();

        const removed = before - user.activeSessions.length;

        await AuditLog.create({
            tenantId: req.tenantId,
            userId: req.user._id || req.user.id,
            userName: req.user.name || req.user.email,
            userEmail: req.user.email,
            action: 'Configure',
            module: 'Session Management',
            details: JSON.stringify({ forcedLogout: true, targetUserId: userId, sessionId }),
        });

        res.json({ success: true, message: removed > 0 ? 'Session terminated' : 'Session not found', removed });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** FORCE LOGOUT all sessions of a user */
exports.forceLogoutAllSessions = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findOne({ _id: userId, tenantId: req.tenantId });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const count = (user.activeSessions || []).length;
        user.activeSessions = [];
        await user.save();

        await AuditLog.create({
            tenantId: req.tenantId,
            userId: req.user._id || req.user.id,
            userName: req.user.name || req.user.email,
            userEmail: req.user.email,
            action: 'Configure',
            module: 'Session Management',
            details: JSON.stringify({ forcedLogoutAll: true, targetUserId: userId, sessionsRemoved: count }),
        });

        res.json({ success: true, message: `${count} session(s) terminated for user` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Logout current session */
exports.logoutCurrentSession = async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        if (!sessionId) return res.status(400).json({ success: false, message: 'Session ID not provided' });

        const user = await User.findById(req.user._id || req.user.id);
        if (user) {
            user.activeSessions = (user.activeSessions || []).filter(s => s.sessionId !== sessionId);
            await user.save();
        }
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/** Get session statistics */
exports.getSessionStats = async (req, res) => {
    try {
        const users = await User.find({ tenantId: req.tenantId, 'activeSessions.0': { $exists: true } })
            .select('role activeSessions');

        let totalSessions = 0;
        const byRole = {};
        users.forEach(u => {
            const count = (u.activeSessions || []).length;
            totalSessions += count;
            byRole[u.role] = (byRole[u.role] || 0) + count;
        });

        res.json({ success: true, data: { totalActiveSessions: totalSessions, activeUsers: users.length, byRole } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * IP Whitelist Middleware
 * BRD Requirement: IP-based access restriction for admin routes
 */

const IpWhitelistConfig = {
    enabled: process.env.IP_WHITELIST_ENABLED === 'true',
    adminWhitelist: (process.env.ADMIN_IP_WHITELIST || '').split(',').filter(Boolean),
};

/**
 * Get real IP from request (handles proxies)
 */
function getClientIP(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        '0.0.0.0'
    );
}

/**
 * Middleware: Restrict Super Admin routes to whitelisted IPs only
 */
function adminIpWhitelist(req, res, next) {
    if (!IpWhitelistConfig.enabled || IpWhitelistConfig.adminWhitelist.length === 0) {
        return next(); // Whitelist not configured → allow all
    }

    const clientIP = getClientIP(req);
    const isAllowed =
        clientIP === '127.0.0.1' ||
        clientIP === '::1' ||
        clientIP === '::ffff:127.0.0.1' || // localhost always allowed
        IpWhitelistConfig.adminWhitelist.some(allowed => {
            if (allowed.includes('/')) {
                // CIDR check (basic)
                return isInCIDR(clientIP, allowed);
            }
            return clientIP === allowed;
        });

    if (!isAllowed) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Your IP address is not authorized.',
            ip: clientIP,
        });
    }

    next();
}

/**
 * Log all requests with IP (non-blocking)
 */
function requestLogger(req, res, next) {
    const ip = getClientIP(req);
    req.clientIP = ip;
    next();
}

/**
 * Middleware: Rate limit per IP (in-memory, production use Redis)
 */
const ipRequestCounts = new Map();
const REQUEST_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN || '200');
const WINDOW_MS = 60 * 1000; // 1 minute

function ipRateLimit(req, res, next) {
    const ip = getClientIP(req);
    const now = Date.now();
    const entry = ipRequestCounts.get(ip) || { count: 0, windowStart: now };

    if (now - entry.windowStart > WINDOW_MS) {
        entry.count = 1;
        entry.windowStart = now;
    } else {
        entry.count++;
    }
    ipRequestCounts.set(ip, entry);

    if (entry.count > REQUEST_LIMIT) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please slow down.',
            retryAfter: Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000),
        });
    }

    // Clean up old IPs periodically
    if (ipRequestCounts.size > 10000) {
        for (const [key, val] of ipRequestCounts) {
            if (now - val.windowStart > WINDOW_MS) ipRequestCounts.delete(key);
        }
    }

    next();
}

/** Simple CIDR check for IPv4 */
function isInCIDR(ip, cidr) {
    try {
        const [range, bits] = cidr.split('/');
        const mask = ~(2 ** (32 - parseInt(bits)) - 1);
        const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet), 0) >>> 0;
        const rangeNum = range.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet), 0) >>> 0;
        return (ipNum & mask) === (rangeNum & mask);
    } catch {
        return false;
    }
}

module.exports = { adminIpWhitelist, requestLogger, ipRateLimit, getClientIP };

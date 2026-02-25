/**
 * Encryption Middleware
 * BRD Requirement: Auto-encrypt sensitive fields on create/update
 *
 * Wraps Employee routes to transparently encrypt Aadhaar, PAN, UAN, ESIC
 * so the controller code stays clean.
 */

const { encryptEmployeeFields, decryptEmployeeFields, maskedEmployeeFields } = require('../utils/fieldEncryption');

/**
 * Middleware: Encrypt sensitive fields in req.body before controller
 */
function encryptBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = encryptEmployeeFields(req.body);
    }
    next();
}

/**
 * Middleware: Decrypt and mask sensitive fields in response
 * Only full reveal for privileged roles (Tenant Admin, HR Administrator, Payroll Administrator)
 */
function maskResponseMiddleware(privilegedRoles = ['Tenant Admin', 'HR Administrator', 'Payroll Administrator']) {
    return (req, res, next) => {
        const originalJson = res.json.bind(res);
        const isPrivileged = privilegedRoles.includes(req.user?.role);

        res.json = function (data) {
            try {
                if (data && data.success && data.data) {
                    if (Array.isArray(data.data)) {
                        data.data = data.data.map(item =>
                            isPrivileged ? decryptEmployeeFields(item) : maskedEmployeeFields(item)
                        );
                    } else if (typeof data.data === 'object') {
                        data.data = isPrivileged ? decryptEmployeeFields(data.data) : maskedEmployeeFields(data.data);
                    }
                }
            } catch (err) {
                // Safe fallback: never break the response due to encryption error
                console.error('[EncryptionMiddleware] mask error:', err.message);
            }
            return originalJson(data);
        };
        next();
    };
}

/**
 * Utility: Encrypt a specific field value (for use in controllers directly)
 */
function encryptField(value) {
    const { encrypt } = require('../utils/fieldEncryption');
    return encrypt(value);
}

/**
 * Utility: Decrypt a specific field value
 */
function decryptField(value) {
    const { decrypt } = require('../utils/fieldEncryption');
    return decrypt(value);
}

module.exports = { encryptBody, maskResponseMiddleware, encryptField, decryptField };

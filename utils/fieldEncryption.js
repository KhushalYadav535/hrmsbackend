/**
 * Field-Level Encryption Service
 * BRD Requirement: Encrypt PII fields — Aadhaar, PAN, Bank Account Number
 * Uses Node.js built-in crypto (AES-256-GCM) — no external dependencies needed
 *
 * FIELD_ENCRYPTION_KEY must be 32 bytes, base64 encoded in .env:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;   // 128-bit IV
const TAG_LENGTH = 16;  // 128-bit auth tag
const ENCODING = 'base64';

function getKey() {
    const raw = process.env.FIELD_ENCRYPTION_KEY;
    if (!raw) {
        // In dev without key: return null-key (graceful degradation)
        if (process.env.NODE_ENV === 'development') {
            return crypto.randomBytes(32); // ephemeral; not safe for production
        }
        throw new Error('FIELD_ENCRYPTION_KEY environment variable is not set');
    }
    const key = Buffer.from(raw, ENCODING);
    if (key.length !== 32) {
        throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
    return key;
}

/**
 * Encrypt a plaintext string → "iv:tag:ciphertext" (all base64)
 */
function encrypt(plaintext) {
    if (!plaintext || plaintext === '') return plaintext;
    // Don't double-encrypt already-encrypted values
    if (typeof plaintext === 'string' && plaintext.startsWith('enc:')) return plaintext;

    try {
        const key = getKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([
            cipher.update(String(plaintext), 'utf8'),
            cipher.final(),
        ]);
        const tag = cipher.getAuthTag();

        return `enc:${iv.toString(ENCODING)}:${tag.toString(ENCODING)}:${encrypted.toString(ENCODING)}`;
    } catch (err) {
        console.error('[FieldEncryption] encrypt error:', err.message);
        return plaintext; // Graceful fallback
    }
}

/**
 * Decrypt "enc:iv:tag:ciphertext" → plaintext string
 */
function decrypt(encryptedValue) {
    if (!encryptedValue) return encryptedValue;
    if (typeof encryptedValue !== 'string' || !encryptedValue.startsWith('enc:')) {
        return encryptedValue; // Not encrypted, return as-is
    }

    try {
        const parts = encryptedValue.split(':');
        if (parts.length !== 4) throw new Error('Invalid encrypted format');

        const key = getKey();
        const iv = Buffer.from(parts[1], ENCODING);
        const tag = Buffer.from(parts[2], ENCODING);
        const ciphertext = Buffer.from(parts[3], ENCODING);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        return decipher.update(ciphertext) + decipher.final('utf8');
    } catch (err) {
        console.error('[FieldEncryption] decrypt error:', err.message);
        return '[DECRYPTION_FAILED]';
    }
}

/**
 * Mask a decrypted value for display (e.g. AADHAAR: XXXX-XXXX-1234)
 */
function mask(value, type = 'default') {
    if (!value || value === '[DECRYPTION_FAILED]') return '****';
    const v = String(value);
    switch (type) {
        case 'aadhaar': // Show last 4 digits: XXXX-XXXX-1234
            return `XXXX-XXXX-${v.slice(-4)}`;
        case 'pan':     // Show first + last 2: AXXXXX0000A → A****1234A? Mask middle
            return `${v[0]}XXXX${v.slice(-4)}`;
        case 'account': // Show last 4 digits
            return `${'X'.repeat(v.length - 4)}${v.slice(-4)}`;
        case 'phone':
            return `XXXXXX${v.slice(-4)}`;
        default:
            return `${v[0]}${'*'.repeat(Math.max(0, v.length - 2))}${v.slice(-1)}`;
    }
}

/**
 * Encrypt all sensitive fields in an Employee/User object
 */
function encryptEmployeeFields(data) {
    const encrypted = { ...data };
    if (data.aadhaarNumber) encrypted.aadhaarNumber = encrypt(data.aadhaarNumber);
    if (data.panNumber) encrypted.panNumber = encrypt(data.panNumber);
    if (data.uanNumber) encrypted.uanNumber = encrypt(data.uanNumber);
    if (data.esicNumber) encrypted.esicNumber = encrypt(data.esicNumber);
    return encrypted;
}

/**
 * Decrypt all sensitive fields in an Employee/User object
 */
function decryptEmployeeFields(data) {
    const decrypted = { ...data };
    if (data.aadhaarNumber) decrypted.aadhaarNumber = decrypt(data.aadhaarNumber);
    if (data.panNumber) decrypted.panNumber = decrypt(data.panNumber);
    if (data.uanNumber) decrypted.uanNumber = decrypt(data.uanNumber);
    if (data.esicNumber) decrypted.esicNumber = decrypt(data.esicNumber);
    return decrypted;
}

/**
 * Returns a masked view (for display without full reveal)
 */
function maskedEmployeeFields(data) {
    return {
        ...data,
        aadhaarNumber: data.aadhaarNumber ? mask(decrypt(data.aadhaarNumber), 'aadhaar') : undefined,
        panNumber: data.panNumber ? mask(decrypt(data.panNumber), 'pan') : undefined,
        uanNumber: data.uanNumber ? mask(decrypt(data.uanNumber), 'account') : undefined,
        esicNumber: data.esicNumber ? mask(decrypt(data.esicNumber), 'account') : undefined,
    };
}

/**
 * Encrypt bank account number
 */
function encryptBankAccount(accountNumber) {
    return encrypt(accountNumber);
}

function decryptBankAccount(encryptedAccount) {
    return decrypt(encryptedAccount);
}

function maskedBankAccount(encryptedAccount) {
    return mask(decrypt(encryptedAccount), 'account');
}

/**
 * Generate a new encryption key (run once, save to .env)
 * Usage: node -e "require('./utils/fieldEncryption').generateKey()"
 */
function generateKey() {
    const key = crypto.randomBytes(32).toString('base64');
    console.log('Add this to your .env file:');
    console.log(`FIELD_ENCRYPTION_KEY=${key}`);
    return key;
}

module.exports = {
    encrypt,
    decrypt,
    mask,
    encryptEmployeeFields,
    decryptEmployeeFields,
    maskedEmployeeFields,
    encryptBankAccount,
    decryptBankAccount,
    maskedBankAccount,
    generateKey,
};

const jwt = require('jsonwebtoken');

// BR-P0-001 Bug 1: Generate token with sessionId for concurrent session detection
const generateToken = (id, sessionId = null) => {
  const payload = { id };
  if (sessionId) {
    payload.sessionId = sessionId;
  }
  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = generateToken;

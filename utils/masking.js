/**
 * Masking Utilities for Sensitive Data
 * BRD Requirement: Never return raw Aadhaar/account numbers in API responses - always mask
 */

/**
 * Mask Aadhaar number (show only last 4 digits)
 * Format: XXXX-XXXX-1234
 * @param {string} aadhaar - Aadhaar number (12 digits)
 * @returns {string} Masked Aadhaar (XXXX-XXXX-1234)
 */
function maskAadhaar(aadhaar) {
  if (!aadhaar || typeof aadhaar !== 'string') {
    return aadhaar;
  }
  
  // Extract digits only
  const digits = aadhaar.replace(/\D/g, '');
  
  if (digits.length !== 12) {
    return aadhaar; // Return as-is if invalid format
  }
  
  // Mask: XXXX-XXXX-1234 (last 4 digits visible)
  return `XXXX-XXXX-${digits.slice(-4)}`;
}

/**
 * Mask account number (show only last 4 digits)
 * Format: XXXX-XXXX-XXXX-1234
 * @param {string} accountNumber - Account number
 * @returns {string} Masked account number
 */
function maskAccountNumber(accountNumber) {
  if (!accountNumber || typeof accountNumber !== 'string') {
    return accountNumber;
  }
  
  // Extract digits only
  const digits = accountNumber.replace(/\D/g, '');
  
  if (digits.length < 4) {
    return accountNumber; // Return as-is if too short
  }
  
  // Mask: Show last 4 digits
  const masked = 'X'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
  
  // Format with dashes for readability (every 4 digits)
  return masked.match(/.{1,4}/g)?.join('-') || masked;
}

/**
 * Mask PAN number (show only last 4 characters)
 * Format: XXXXX1234
 * @param {string} pan - PAN number
 * @returns {string} Masked PAN (XXXXX1234)
 */
function maskPAN(pan) {
  if (!pan || typeof pan !== 'string') {
    return pan;
  }
  
  // PAN format: ABCDE1234F (5 letters, 4 digits, 1 letter)
  const cleaned = pan.toUpperCase().replace(/\s/g, '');
  
  if (cleaned.length !== 10) {
    return pan; // Return as-is if invalid format
  }
  
  // Mask: XXXXX1234 (last 4 characters visible)
  return 'XXXXX' + cleaned.slice(-4);
}

/**
 * Mask phone number (show only last 4 digits)
 * Format: XXXXXX1234
 * @param {string} phone - Phone number
 * @returns {string} Masked phone (XXXXXX1234)
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return phone;
  }
  
  // Extract digits only
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 4) {
    return phone; // Return as-is if too short
  }
  
  // Mask: Show last 4 digits
  return 'X'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}

/**
 * Mask sensitive employee data in response
 * @param {Object} employee - Employee object
 * @returns {Object} Employee object with masked sensitive fields
 */
function maskEmployeeData(employee) {
  if (!employee || typeof employee !== 'object') {
    return employee;
  }
  
  const masked = { ...employee };
  
  // Mask Aadhaar
  if (masked.aadhaarNumber) {
    masked.aadhaarNumber = maskAadhaar(masked.aadhaarNumber);
  }
  
  // Mask PAN
  if (masked.panNumber) {
    masked.panNumber = maskPAN(masked.panNumber);
  }
  
  // Mask bank account (if still in Employee model)
  if (masked.bankAccount) {
    masked.bankAccount = maskAccountNumber(masked.bankAccount);
  }
  
  return masked;
}

/**
 * Mask bank account data
 * @param {Object} bankAccount - Bank account object
 * @returns {Object} Bank account with masked account number
 */
function maskBankAccountData(bankAccount) {
  if (!bankAccount || typeof bankAccount !== 'object') {
    return bankAccount;
  }
  
  const masked = { ...bankAccount };
  
  if (masked.accountNumber) {
    masked.accountNumber = maskAccountNumber(masked.accountNumber);
  }
  
  return masked;
}

/**
 * Mask array of sensitive data
 * @param {Array} items - Array of objects with sensitive data
 * @param {Function} maskFunction - Function to mask each item
 * @returns {Array} Array with masked data
 */
function maskArray(items, maskFunction) {
  if (!Array.isArray(items)) {
    return items;
  }
  
  return items.map(item => maskFunction(item));
}

module.exports = {
  maskAadhaar,
  maskAccountNumber,
  maskPAN,
  maskPhone,
  maskEmployeeData,
  maskBankAccountData,
  maskArray,
};

/**
 * Core Banking System (CBS) Integration Service
 * BRD Requirement: INT-CBS-007
 * Handles bank account validation, transaction status confirmation, and failed credit tracking
 */

const axios = require('axios');
const crypto = require('crypto');

class CBSService {
  constructor(config) {
    this.config = config || {
      // CBS API Configuration
      apiUrl: process.env.CBS_API_URL || 'https://api.indianbank.in/cbs/v1',
      apiKey: process.env.CBS_API_KEY,
      apiSecret: process.env.CBS_API_SECRET,
      clientId: process.env.CBS_CLIENT_ID,
      
      // Endpoints
      accountValidationEndpoint: '/account/validate',
      accountDetailsEndpoint: '/account/details',
      transactionStatusEndpoint: '/transaction/status',
      transactionHistoryEndpoint: '/transaction/history',
      bulkTransactionStatusEndpoint: '/transaction/bulk-status',
      
      // Timeout settings
      timeout: 30000, // 30 seconds
      
      // Retry configuration
      maxRetries: 3,
      retryDelay: 1000, // 1 second
    };
  }

  /**
   * Validate bank account details
   * BRD: INT-CBS-007 - Validate employee account number and IFSC before enrollment
   */
  async validateAccount(accountNumber, ifscCode, accountHolderName = null) {
    try {
      // Validate inputs
      if (!accountNumber || !ifscCode) {
        throw new Error('Account number and IFSC code are required');
      }

      // Prepare request payload
      const payload = {
        accountNumber: accountNumber,
        ifscCode: ifscCode.toUpperCase(),
        accountHolderName: accountHolderName,
        timestamp: new Date().toISOString(),
      };

      // Generate request signature
      const signature = this.generateSignature(payload);

      // Make API call to CBS
      const response = await axios.post(
        `${this.config.apiUrl}${this.config.accountValidationEndpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey || '',
            'X-Client-ID': this.config.clientId || '',
            'X-Signature': signature || '',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.status === 'valid') {
        return {
          valid: true,
          accountNumber: accountNumber,
          ifscCode: ifscCode.toUpperCase(),
          accountHolderName: response.data.accountHolderName || accountHolderName,
          bankName: response.data.bankName,
          branchName: response.data.branchName,
          accountType: response.data.accountType, // Savings/Current/etc.
          accountStatus: response.data.accountStatus, // Active/Closed/etc.
          nameMatch: response.data.nameMatch !== false, // If name provided, check match
          response: response.data,
          message: 'Account validated successfully',
        };
      } else {
        return {
          valid: false,
          accountNumber: accountNumber,
          ifscCode: ifscCode.toUpperCase(),
          reason: response.data?.reason || 'Account validation failed',
          response: response.data,
          message: response.data?.message || 'Invalid account details',
        };
      }
    } catch (error) {
      // If API is not configured or unavailable, perform basic validation
      if (!this.config.apiKey || error.code === 'ECONNREFUSED' || error.response?.status === 401) {
        // Basic format validation
        const isValidFormat = this.validateAccountFormat(accountNumber, ifscCode);
        
        return {
          valid: isValidFormat,
          accountNumber: accountNumber,
          ifscCode: ifscCode.toUpperCase(),
          message: isValidFormat 
            ? 'Account format is valid (API validation unavailable - configure CBS_API_KEY)' 
            : 'Invalid account format',
          apiConfigured: false,
        };
      }

      throw new Error(`CBS account validation failed: ${error.message}`);
    }
  }

  /**
   * Get account details (for Indian Bank accounts)
   * BRD: INT-CBS-007 - Auto-fetch account details for Indian Bank accounts
   */
  async getAccountDetails(accountNumber, ifscCode = null) {
    try {
      if (!accountNumber) {
        throw new Error('Account number is required');
      }

      const payload = {
        accountNumber: accountNumber,
        ifscCode: ifscCode,
        timestamp: new Date().toISOString(),
      };

      const signature = this.generateSignature(payload);

      const response = await axios.get(
        `${this.config.apiUrl}${this.config.accountDetailsEndpoint}`,
        {
          params: {
            accountNumber: accountNumber,
            ifscCode: ifscCode,
          },
          headers: {
            'X-API-Key': this.config.apiKey || '',
            'X-Client-ID': this.config.clientId || '',
            'X-Signature': signature || '',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          accountNumber: response.data.accountNumber,
          ifscCode: response.data.ifscCode,
          accountHolderName: response.data.accountHolderName,
          bankName: response.data.bankName,
          branchName: response.data.branchName,
          branchAddress: response.data.branchAddress,
          accountType: response.data.accountType,
          accountStatus: response.data.accountStatus,
          micrCode: response.data.micrCode,
          response: response.data,
        };
      } else {
        throw new Error(response.data?.message || 'Failed to fetch account details');
      }
    } catch (error) {
      if (!this.config.apiKey || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'CBS API not configured',
          apiConfigured: false,
        };
      }
      throw new Error(`Failed to fetch account details: ${error.message}`);
    }
  }

  /**
   * Confirm transaction status
   * BRD: INT-CBS-007 - Confirm salary credit transactions
   */
  async confirmTransactionStatus(transactionReference, transactionDate = null) {
    try {
      if (!transactionReference) {
        throw new Error('Transaction reference is required');
      }

      const payload = {
        transactionReference: transactionReference,
        transactionDate: transactionDate || new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
      };

      const signature = this.generateSignature(payload);

      const response = await axios.post(
        `${this.config.apiUrl}${this.config.transactionStatusEndpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey || '',
            'X-Client-ID': this.config.clientId || '',
            'X-Signature': signature || '',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data) {
        return {
          success: true,
          transactionReference: transactionReference,
          status: response.data.status, // Success/Failed/Pending
          transactionDate: response.data.transactionDate,
          creditDate: response.data.creditDate,
          amount: response.data.amount,
          failureReason: response.data.failureReason,
          utrNumber: response.data.utrNumber, // UTR for NEFT/RTGS
          response: response.data,
        };
      } else {
        throw new Error('Invalid response from CBS');
      }
    } catch (error) {
      if (!this.config.apiKey || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          transactionReference: transactionReference,
          status: 'Unknown',
          message: 'CBS API not configured',
          apiConfigured: false,
        };
      }
      throw new Error(`Transaction status check failed: ${error.message}`);
    }
  }

  /**
   * Bulk transaction status check
   * BRD: INT-CBS-007 - Track failed credits for reprocessing
   */
  async bulkConfirmTransactionStatus(transactionReferences) {
    try {
      if (!Array.isArray(transactionReferences) || transactionReferences.length === 0) {
        throw new Error('Transaction references array is required');
      }

      const payload = {
        transactionReferences: transactionReferences,
        timestamp: new Date().toISOString(),
      };

      const signature = this.generateSignature(payload);

      const response = await axios.post(
        `${this.config.apiUrl}${this.config.bulkTransactionStatusEndpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey || '',
            'X-Client-ID': this.config.clientId || '',
            'X-Signature': signature || '',
          },
          timeout: this.config.timeout * 2, // Longer timeout for bulk operations
        }
      );

      if (response.data && response.data.transactions) {
        const transactions = response.data.transactions;
        const successful = transactions.filter(t => t.status === 'Success');
        const failed = transactions.filter(t => t.status === 'Failed');
        const pending = transactions.filter(t => t.status === 'Pending');

        return {
          success: true,
          total: transactions.length,
          successful: successful.length,
          failed: failed.length,
          pending: pending.length,
          transactions: transactions,
          failedTransactions: failed,
          response: response.data,
        };
      } else {
        throw new Error('Invalid response from CBS');
      }
    } catch (error) {
      if (!this.config.apiKey || error.code === 'ECONNREFUSED') {
        // Return mock response if API not configured
        return {
          success: false,
          total: transactionReferences.length,
          successful: 0,
          failed: 0,
          pending: transactionReferences.length,
          transactions: transactionReferences.map(ref => ({
            transactionReference: ref,
            status: 'Unknown',
            message: 'CBS API not configured',
          })),
          apiConfigured: false,
        };
      }
      throw new Error(`Bulk transaction status check failed: ${error.message}`);
    }
  }

  /**
   * Get transaction history for an account
   */
  async getTransactionHistory(accountNumber, fromDate, toDate, limit = 100) {
    try {
      if (!accountNumber) {
        throw new Error('Account number is required');
      }

      const params = {
        accountNumber: accountNumber,
        fromDate: fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
        toDate: toDate || new Date().toISOString().split('T')[0],
        limit: limit,
      };

      const signature = this.generateSignature(params);

      const response = await axios.get(
        `${this.config.apiUrl}${this.config.transactionHistoryEndpoint}`,
        {
          params,
          headers: {
            'X-API-Key': this.config.apiKey || '',
            'X-Client-ID': this.config.clientId || '',
            'X-Signature': signature || '',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          accountNumber: accountNumber,
          transactions: response.data.transactions || [],
          total: response.data.total || 0,
          response: response.data,
        };
      } else {
        throw new Error(response.data?.message || 'Failed to fetch transaction history');
      }
    } catch (error) {
      if (!this.config.apiKey || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          transactions: [],
          message: 'CBS API not configured',
          apiConfigured: false,
        };
      }
      throw new Error(`Transaction history fetch failed: ${error.message}`);
    }
  }

  /**
   * Generate request signature for CBS API
   */
  generateSignature(payload) {
    if (!this.config.apiSecret) {
      return null;
    }

    // Create signature string
    const signatureString = JSON.stringify(payload) + this.config.apiSecret;
    
    // Generate SHA-256 hash
    const signature = crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');

    return signature;
  }

  /**
   * Basic account format validation (fallback when API not available)
   */
  validateAccountFormat(accountNumber, ifscCode) {
    // Account number: 9-18 digits
    const accountRegex = /^\d{9,18}$/;
    
    // IFSC: 11 characters, first 4 letters, 5th is 0, last 6 alphanumeric
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

    return accountRegex.test(accountNumber) && ifscRegex.test(ifscCode.toUpperCase());
  }

  /**
   * Retry mechanism for API calls
   */
  async retryApiCall(apiCall, maxRetries = null, retryDelay = null) {
    const max = maxRetries || this.config.maxRetries;
    const delay = retryDelay || this.config.retryDelay;

    for (let attempt = 1; attempt <= max; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        if (attempt === max) {
          throw error;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
}

module.exports = CBSService;

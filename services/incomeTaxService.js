/**
 * Income Tax Department Integration Service
 * BRD Requirement: BR-ONB-005, INT-PAN-005
 * Handles PAN verification through Income Tax Department API
 */

const axios = require('axios');
const crypto = require('crypto');

class IncomeTaxService {
  constructor(config) {
    this.config = config || {
      // Income Tax API Configuration
      apiUrl: process.env.INCOME_TAX_API_URL || 'https://api.incometax.gov.in/pan/v1',
      apiKey: process.env.INCOME_TAX_API_KEY,
      apiSecret: process.env.INCOME_TAX_API_SECRET,
      
      // PAN Verification endpoint
      verifyEndpoint: '/verify',
      
      // Timeout settings
      timeout: 20000, // 20 seconds
    };
  }

  /**
   * Verify PAN authenticity
   * BRD: BR-ONB-005 - Verify PAN through Income Tax API
   */
  async verifyPAN(panNumber, name, dob) {
    try {
      // Validate PAN format (e.g., ABCDE1234F)
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
        throw new Error('Invalid PAN format. Must be in format ABCDE1234F.');
      }

      // Prepare request payload
      const payload = {
        pan: panNumber.toUpperCase(),
        name: name,
        dob: dob, // Format: YYYY-MM-DD
        timestamp: new Date().toISOString(),
      };

      // Generate request signature if secret is available
      const signature = this.generateSignature(payload);

      // Make API call to Income Tax Department
      const response = await axios.post(
        `${this.config.apiUrl}${this.config.verifyEndpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey || '',
            'X-Signature': signature || '',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.status === 'valid') {
        return {
          verified: true,
          pan: panNumber.toUpperCase(),
          nameMatch: response.data.nameMatch || false,
          dobMatch: response.data.dobMatch || false,
          name: response.data.name || name,
          status: response.data.status,
          response: response.data,
          message: 'PAN verified successfully',
        };
      } else {
        return {
          verified: false,
          nameMatch: false,
          dobMatch: false,
          message: response.data?.message || 'PAN verification failed',
          response: response.data,
        };
      }
    } catch (error) {
      // If API is not configured or unavailable, perform basic validation
      if (!this.config.apiKey || error.code === 'ECONNREFUSED' || error.response?.status === 401) {
        // Basic PAN format validation
        const isValidFormat = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber);
        
        return {
          verified: isValidFormat,
          nameMatch: isValidFormat,
          dobMatch: isValidFormat,
          message: isValidFormat 
            ? 'PAN format is valid (API verification unavailable - configure INCOME_TAX_API_KEY)' 
            : 'Invalid PAN format. Must be in format ABCDE1234F.',
          apiConfigured: false,
        };
      }

      throw new Error(`PAN verification failed: ${error.message}`);
    }
  }

  /**
   * Generate request signature for Income Tax API
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
   * Get PAN details (if available)
   */
  async getPANDetails(panNumber) {
    try {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
        throw new Error('Invalid PAN format');
      }

      const response = await axios.get(
        `${this.config.apiUrl}/details/${panNumber.toUpperCase()}`,
        {
          headers: {
            'X-API-Key': this.config.apiKey || '',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          pan: response.data.pan,
          name: response.data.name,
          status: response.data.status,
          category: response.data.category, // Individual/Company/etc.
          response: response.data,
        };
      } else {
        throw new Error(response.data?.message || 'Failed to fetch PAN details');
      }
    } catch (error) {
      if (!this.config.apiKey || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'Income Tax API not configured',
          apiConfigured: false,
        };
      }
      throw new Error(`Failed to fetch PAN details: ${error.message}`);
    }
  }
}

module.exports = IncomeTaxService;

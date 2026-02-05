/**
 * DigiLocker Integration Service
 * BRD Requirement: BR-ONB-006, INT-DIGI-006
 * Handles document fetching from DigiLocker via OAuth-based API
 */

const axios = require('axios');
const crypto = require('crypto');

class DigiLockerService {
  constructor(config) {
    this.config = config || {
      // DigiLocker API Configuration
      apiUrl: process.env.DIGILOCKER_API_URL || 'https://api.digilocker.gov.in/v1',
      clientId: process.env.DIGILOCKER_CLIENT_ID,
      clientSecret: process.env.DIGILOCKER_CLIENT_SECRET,
      redirectUri: process.env.DIGILOCKER_REDIRECT_URI || 'http://localhost:3000/auth/digilocker/callback',
      
      // OAuth endpoints
      authEndpoint: '/oauth2/authorize',
      tokenEndpoint: '/oauth2/token',
      documentsEndpoint: '/documents',
      
      // Timeout settings
      timeout: 30000, // 30 seconds
    };
  }

  /**
   * Generate OAuth authorization URL
   * BRD: BR-ONB-006 - OAuth-based document access
   */
  generateAuthUrl(state, scope = 'read') {
    const params = new URLSearchParams({
      client_id: this.config.clientId || '',
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scope,
      state: state,
    });

    return `${this.config.apiUrl}${this.config.authEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(authorizationCode) {
    try {
      if (!this.config.clientId || !this.config.clientSecret) {
        throw new Error('DigiLocker client credentials not configured');
      }

      const payload = {
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      };

      const response = await axios.post(
        `${this.config.apiUrl}${this.config.tokenEndpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.access_token) {
        return {
          success: true,
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresIn: response.data.expires_in,
          tokenType: response.data.token_type || 'Bearer',
          response: response.data,
        };
      } else {
        throw new Error(response.data?.error_description || 'Failed to exchange code for token');
      }
    } catch (error) {
      if (!this.config.clientId || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'DigiLocker API not configured. Please configure DIGILOCKER_CLIENT_ID and DIGILOCKER_CLIENT_SECRET.',
          apiConfigured: false,
        };
      }
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  /**
   * Fetch documents from DigiLocker
   * BRD: BR-ONB-006 - Fetch documents via OAuth
   */
  async fetchDocuments(accessToken, aadhaarNumber) {
    try {
      if (!accessToken) {
        throw new Error('Access token is required');
      }

      const params = {};
      if (aadhaarNumber) {
        params.aadhaar = aadhaarNumber;
      }

      const response = await axios.get(
        `${this.config.apiUrl}${this.config.documentsEndpoint}`,
        {
          params,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          documents: response.data.documents || [],
          totalDocuments: response.data.totalDocuments || 0,
          response: response.data,
        };
      } else {
        throw new Error(response.data?.message || 'Failed to fetch documents');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        return {
          success: false,
          message: 'Invalid or expired access token. Please re-authenticate.',
          documents: [],
        };
      }

      if (!this.config.clientId || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'DigiLocker API not configured',
          documents: [],
          apiConfigured: false,
        };
      }

      throw new Error(`Failed to fetch DigiLocker documents: ${error.message}`);
    }
  }

  /**
   * Get specific document by type
   */
  async getDocumentByType(accessToken, documentType, aadhaarNumber) {
    try {
      const result = await this.fetchDocuments(accessToken, aadhaarNumber);
      
      if (result.success && result.documents) {
        const document = result.documents.find(doc => 
          doc.type?.toLowerCase() === documentType.toLowerCase()
        );

        if (document) {
          return {
            success: true,
            document: document,
          };
        } else {
          return {
            success: false,
            message: `Document type ${documentType} not found in DigiLocker`,
          };
        }
      } else {
        return result;
      }
    } catch (error) {
      throw new Error(`Failed to get document: ${error.message}`);
    }
  }

  /**
   * Download document content
   */
  async downloadDocument(accessToken, documentUri) {
    try {
      const response = await axios.get(
        documentUri,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          responseType: 'arraybuffer',
          timeout: this.config.timeout,
        }
      );

      if (response.data) {
        return {
          success: true,
          content: response.data,
          contentType: response.headers['content-type'] || 'application/pdf',
          contentLength: response.data.length,
        };
      } else {
        throw new Error('No document content received');
      }
    } catch (error) {
      throw new Error(`Document download failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    try {
      if (!this.config.clientId || !this.config.clientSecret) {
        throw new Error('DigiLocker client credentials not configured');
      }

      const payload = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      };

      const response = await axios.post(
        `${this.config.apiUrl}${this.config.tokenEndpoint}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: this.config.timeout,
        }
      );

      if (response.data && response.data.access_token) {
        return {
          success: true,
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token || refreshToken,
          expiresIn: response.data.expires_in,
          response: response.data,
        };
      } else {
        throw new Error(response.data?.error_description || 'Failed to refresh token');
      }
    } catch (error) {
      if (!this.config.clientId || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'DigiLocker API not configured',
          apiConfigured: false,
        };
      }
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
}

module.exports = DigiLockerService;

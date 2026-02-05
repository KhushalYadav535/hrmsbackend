/**
 * TRACES Integration Service
 * BRD Requirement: BR-INT-TRACES-003
 * Handles Form 24Q generation, FVU validation, TRACES portal upload, and Form 16 Part A download
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class TRACESService {
  constructor(config) {
    this.config = config || {
      // TRACES Portal API Configuration
      portalApiUrl: process.env.TRACES_PORTAL_API_URL || 'https://www.tdscpc.gov.in',
      tan: process.env.TRACES_TAN,
      tanPassword: process.env.TRACES_TAN_PASSWORD,
      
      // Upload endpoints
      uploadEndpoint: process.env.TRACES_UPLOAD_ENDPOINT || '/api/tds/upload',
      form16DownloadEndpoint: process.env.TRACES_FORM16_DOWNLOAD_ENDPOINT || '/api/tds/form16/download',
      
      // FVU Utility path (File Validation Utility)
      fvuUtilityPath: process.env.FVU_UTILITY_PATH || path.join(__dirname, '../../utils/fvu'),
      
      // File storage
      tempDir: process.env.TEMP_DIR || path.join(__dirname, '../../temp'),
    };
  }

  /**
   * Generate Form 24Q in JSON format
   * BRD: BR-INT-TRACES-003 - Generate Form 24Q in JSON format
   */
  async generateForm24QJSON(form24QData) {
    try {
      // Form 24Q JSON structure as per TRACES specifications
      const form24QJSON = {
        // Header information
        formType: '24Q',
        financialYear: form24QData.financialYear,
        quarter: form24QData.quarter,
        tan: form24QData.employerDetails?.tan || this.config.tan,
        
        // Employer details
        employer: {
          tan: form24QData.employerDetails?.tan || this.config.tan,
          name: form24QData.employerDetails?.name,
          address: form24QData.employerDetails?.address,
          state: form24QData.employerDetails?.state,
          pinCode: form24QData.employerDetails?.pinCode,
          email: form24QData.employerDetails?.email,
          phone: form24QData.employerDetails?.phone,
        },
        
        // Employee TDS details (Annexure I)
        annexureI: form24QData.employeeTdsDetails.map(emp => ({
          srNo: emp.srNo || 0,
          pan: emp.pan,
          employeeName: emp.name,
          sectionCode: emp.sectionCode || '192', // 192 = Salary
          tdsAmount: emp.tdsAmount || 0,
          tdsDeposited: emp.tdsDeposited || 0,
          challans: emp.challanDetails?.map(challan => ({
            challanNumber: challan.challanNumber,
            challanDate: challan.challanDate,
            bsrCode: challan.bsrCode,
            amount: challan.amount,
          })) || [],
        })),
        
        // Summary
        summary: {
          totalTdsAmount: form24QData.totalTdsAmount || 0,
          totalTdsDeposited: form24QData.totalTdsDeposited || 0,
          totalChallans: form24QData.totalChallans || 0,
          totalEmployees: form24QData.employeeTdsDetails?.length || 0,
        },
        
        // Metadata
        generatedDate: new Date().toISOString(),
        generatedBy: form24QData.generatedBy,
      };

      // Convert to JSON string with proper formatting
      const jsonContent = JSON.stringify(form24QJSON, null, 2);

      // Generate file hash
      const fileHash = crypto.createHash('sha256').update(jsonContent).digest('hex');

      return {
        jsonContent,
        fileName: `Form24Q_${form24QData.financialYear}_${form24QData.quarter}_${Date.now()}.json`,
        fileHash,
        recordCount: form24QData.employeeTdsDetails?.length || 0,
      };
    } catch (error) {
      throw new Error(`Form 24Q JSON generation failed: ${error.message}`);
    }
  }

  /**
   * Validate Form 24Q using FVU (File Validation Utility)
   * BRD: BR-INT-TRACES-003 - Validate using FVU utility
   */
  async validateWithFVU(jsonFilePath) {
    try {
      // FVU validation (TRACES File Validation Utility)
      // Note: FVU is a Windows executable provided by TRACES
      // In production, this would call the actual FVU utility
      
      // Check if FVU utility exists
      const fvuExists = await fs.access(this.config.fvuUtilityPath).then(() => true).catch(() => false);
      
      if (!fvuExists) {
        // If FVU utility is not available, perform basic validation
        const jsonContent = await fs.readFile(jsonFilePath, 'utf8');
        const form24QData = JSON.parse(jsonContent);
        
        // Basic validation checks
        const errors = [];
        
        if (!form24QData.tan || form24QData.tan.length !== 10) {
          errors.push('Invalid TAN format');
        }
        
        if (!form24QData.financialYear || !/^\d{4}-\d{2}$/.test(form24QData.financialYear)) {
          errors.push('Invalid financial year format');
        }
        
        if (!form24QData.quarter || !['Q1', 'Q2', 'Q3', 'Q4'].includes(form24QData.quarter)) {
          errors.push('Invalid quarter');
        }
        
        if (!form24QData.annexureI || form24QData.annexureI.length === 0) {
          errors.push('No employee TDS details found');
        }
        
        // Validate PANs
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        form24QData.annexureI.forEach((emp, index) => {
          if (!panRegex.test(emp.pan)) {
            errors.push(`Invalid PAN at record ${index + 1}: ${emp.pan}`);
          }
        });
        
        return {
          valid: errors.length === 0,
          errors,
          message: errors.length === 0 ? 'Form 24Q validation passed' : 'Validation errors found',
          fvuAvailable: false,
        };
      }
      
      // If FVU utility is available, use it for validation
      try {
        const { stdout, stderr } = await execPromise(
          `"${this.config.fvuUtilityPath}" "${jsonFilePath}"`
        );
        
        // Parse FVU output
        const isValid = !stderr && stdout.includes('VALID');
        const errors = stderr ? stderr.split('\n').filter(line => line.trim()) : [];
        
        return {
          valid: isValid,
          errors,
          message: isValid ? 'Form 24Q validation passed (FVU)' : 'FVU validation failed',
          fvuAvailable: true,
          fvuOutput: stdout,
        };
      } catch (execError) {
        return {
          valid: false,
          errors: [execError.message],
          message: 'FVU validation error',
          fvuAvailable: true,
        };
      }
    } catch (error) {
      throw new Error(`FVU validation failed: ${error.message}`);
    }
  }

  /**
   * Upload Form 24Q to TRACES portal
   * BRD: BR-INT-TRACES-003 - Upload quarterly TDS returns
   */
  async uploadForm24Q(jsonFilePath, financialYear, quarter) {
    try {
      // Read JSON file
      const jsonContent = await fs.readFile(jsonFilePath, 'utf8');
      
      // Prepare form data for upload
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', jsonContent, {
        filename: path.basename(jsonFilePath),
        contentType: 'application/json',
      });
      formData.append('tan', this.config.tan);
      formData.append('financialYear', financialYear);
      formData.append('quarter', quarter);

      // Upload to TRACES portal
      const response = await axios.post(
        `${this.config.portalApiUrl}${this.config.uploadEndpoint}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Basic ${Buffer.from(`${this.config.tan}:${this.config.tanPassword}`).toString('base64')}`,
          },
          timeout: 60000, // 60 seconds timeout for large files
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          acknowledgmentNumber: response.data.acknowledgmentNumber,
          uploadedAt: new Date(),
          message: 'Form 24Q uploaded successfully to TRACES',
          tracesResponse: response.data,
        };
      } else {
        throw new Error(response.data?.message || 'TRACES upload failed');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(`TRACES upload failed: ${error.response.data?.message || error.message}`);
      }
      throw new Error(`TRACES upload failed: ${error.message}`);
    }
  }

  /**
   * Download Form 16 Part A from TRACES
   * BRD: BR-INT-TRACES-003 - Download Form 16 Part A after processing
   */
  async downloadForm16PartA(acknowledgmentNumber, financialYear, employeePan) {
    try {
      const response = await axios.get(
        `${this.config.portalApiUrl}${this.config.form16DownloadEndpoint}`,
        {
          params: {
            acknowledgmentNumber,
            financialYear,
            pan: employeePan,
          },
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.config.tan}:${this.config.tanPassword}`).toString('base64')}`,
          },
          responseType: 'arraybuffer', // For PDF/binary files
          timeout: 30000,
        }
      );

      if (response.data) {
        // Save Form 16 Part A PDF
        const fileName = `Form16_PartA_${employeePan}_${financialYear}_${Date.now()}.pdf`;
        const filePath = path.join(this.config.tempDir, fileName);
        
        await fs.mkdir(this.config.tempDir, { recursive: true });
        await fs.writeFile(filePath, response.data);

        return {
          success: true,
          filePath,
          fileName,
          fileSize: response.data.length,
          downloadedAt: new Date(),
          message: 'Form 16 Part A downloaded successfully',
        };
      } else {
        throw new Error('No data received from TRACES');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return {
          success: false,
          message: 'Form 16 Part A not yet available. Please check again after TRACES processing.',
        };
      }
      throw new Error(`Form 16 Part A download failed: ${error.message}`);
    }
  }

  /**
   * Bulk download Form 16 Part A for all employees
   */
  async bulkDownloadForm16PartA(acknowledgmentNumber, financialYear, employeePans) {
    const results = [];
    
    for (const pan of employeePans) {
      try {
        const result = await this.downloadForm16PartA(acknowledgmentNumber, financialYear, pan);
        results.push({
          pan,
          ...result,
        });
        
        // Rate limiting: wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({
          pan,
          success: false,
          message: `Download failed: ${error.message}`,
        });
      }
    }

    return {
      results,
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    };
  }

  /**
   * Check Form 24Q upload status
   */
  async checkUploadStatus(acknowledgmentNumber) {
    try {
      const response = await axios.get(
        `${this.config.portalApiUrl}/api/tds/status`,
        {
          params: {
            acknowledgmentNumber,
          },
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.config.tan}:${this.config.tanPassword}`).toString('base64')}`,
          },
          timeout: 10000,
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          status: response.data.processingStatus, // Processing/Processed/Failed
          processedDate: response.data.processedDate,
          form16Available: response.data.form16Available,
          message: response.data.message,
        };
      } else {
        return {
          success: false,
          message: response.data?.message || 'Status unavailable',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Status check failed: ${error.message}`,
        apiAvailable: false,
      };
    }
  }
}

module.exports = TRACESService;

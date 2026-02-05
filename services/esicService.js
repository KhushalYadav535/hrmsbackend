/**
 * ESIC Integration Service
 * BRD Requirement: BR-INT-ESIC-002, BR-PAY-004
 * Handles ESIC file generation, portal submission, and payment tracking
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class ESICService {
  constructor(config) {
    this.config = config || {
      // ESIC Portal API Configuration
      portalApiUrl: process.env.ESIC_PORTAL_API_URL || 'https://www.esic.in',
      ipNumber: process.env.ESIC_IP_NUMBER,
      ipPassword: process.env.ESIC_IP_PASSWORD,
      ipCode: process.env.ESIC_IP_CODE,
      
      // File upload configuration
      uploadEndpoint: process.env.ESIC_UPLOAD_ENDPOINT || '/api/ip/contribution/upload',
      
      // Payment tracking
      paymentTrackingEndpoint: process.env.ESIC_PAYMENT_TRACKING_ENDPOINT || '/api/ip/payment/track',
      
      // File storage
      tempDir: process.env.TEMP_DIR || path.join(__dirname, '../../temp'),
    };
  }

  /**
   * Generate ESIC monthly return file
   * BRD: BR-PAY-004 - Generate monthly return in ESIC format
   */
  async generateESICFile(payrolls, month, year) {
    try {
      const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month);
      const monthNumber = monthIndex + 1;

      // ESIC Format (as per ESIC specifications)
      // Header: IP_NUMBER|MONTH|YEAR|TOTAL_MEMBERS|TOTAL_WAGES|TOTAL_EMPLOYEE_CONTRIBUTION|TOTAL_EMPLOYER_CONTRIBUTION|TOTAL_CONTRIBUTION
      // Records: IP_NUMBER|MEMBER_NAME|IP_MEMBER_ID|GROSS_WAGES|EMPLOYEE_CONTRIBUTION|EMPLOYER_CONTRIBUTION|TOTAL_CONTRIBUTION

      let totalWages = 0;
      let totalEmployeeContribution = 0;
      let totalEmployerContribution = 0;
      let totalContribution = 0;

      const records = payrolls
        .filter(p => {
          const gross = (p.basicSalary || 0) + (p.da || 0) + (p.hra || 0) + (p.allowances || 0);
          return gross <= 21000 && p.esiDeduction > 0;
        })
        .map(payroll => {
          const employee = payroll.employeeId;
          const ipMemberId = employee?.esiNumber || '';
          const memberName = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
          const grossWages = (payroll.basicSalary || 0) + (payroll.da || 0) + (payroll.hra || 0) + (payroll.allowances || 0);
          const employeeContribution = payroll.esiDeduction || 0;
          const employerContribution = payroll.employerESI || 0;
          const contribution = employeeContribution + employerContribution;

          totalWages += grossWages;
          totalEmployeeContribution += employeeContribution;
          totalEmployerContribution += employerContribution;
          totalContribution += contribution;

          return `${this.config.ipNumber}|${memberName}|${ipMemberId}|${grossWages}|${employeeContribution}|${employerContribution}|${contribution}`;
        });

      if (records.length === 0) {
        throw new Error('No ESIC contributions found for the specified period');
      }

      // Generate header
      const header = `${this.config.ipNumber}|${monthNumber}|${year}|${records.length}|${totalWages}|${totalEmployeeContribution}|${totalEmployerContribution}|${totalContribution}`;
      
      // Combine header and records
      const fileContent = [header, ...records].join('\n');

      // Generate file hash for validation
      const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');

      return {
        fileContent,
        fileName: `ESIC_${this.config.ipNumber}_${monthNumber}_${year}_${Date.now()}.txt`,
        recordCount: records.length,
        totalWages,
        totalEmployeeContribution,
        totalEmployerContribution,
        totalContribution,
        fileHash,
      };
    } catch (error) {
      throw new Error(`ESIC file generation failed: ${error.message}`);
    }
  }

  /**
   * Upload ESIC return file to portal
   * BRD: BR-INT-ESIC-002 - Submit monthly returns via portal
   */
  async uploadESICFile(fileContent, fileName, month, year) {
    try {
      // Ensure temp directory exists
      await fs.mkdir(this.config.tempDir, { recursive: true });
      
      // Write file to temp location
      const tempFilePath = path.join(this.config.tempDir, fileName);
      await fs.writeFile(tempFilePath, fileContent, 'utf8');

      // Read file as buffer for upload
      const fileBuffer = await fs.readFile(tempFilePath);

      // Prepare form data for upload
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: 'text/plain',
      });
      formData.append('ipNumber', this.config.ipNumber);
      formData.append('ipCode', this.config.ipCode);
      formData.append('month', month);
      formData.append('year', year.toString());

      // Upload to ESIC portal
      const response = await axios.post(
        `${this.config.portalApiUrl}${this.config.uploadEndpoint}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Basic ${Buffer.from(`${this.config.ipNumber}:${this.config.ipPassword}`).toString('base64')}`,
          },
          timeout: 30000,
        }
      );

      // Clean up temp file
      await fs.unlink(tempFilePath);

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          returnNumber: response.data.returnNumber,
          acknowledgmentNumber: response.data.acknowledgmentNumber,
          uploadedAt: new Date(),
          message: 'ESIC return uploaded successfully',
        };
      } else {
        throw new Error(response.data?.message || 'ESIC upload failed');
      }
    } catch (error) {
      // Clean up temp file on error
      const tempFilePath = path.join(this.config.tempDir, fileName);
      try {
        await fs.unlink(tempFilePath);
      } catch (unlinkError) {
        // Ignore cleanup errors
      }

      throw new Error(`ESIC portal upload failed: ${error.message}`);
    }
  }

  /**
   * Track contribution payment status
   * BRD: BR-INT-ESIC-002 - Track contribution payments
   */
  async trackPaymentStatus(month, year) {
    try {
      const response = await axios.get(
        `${this.config.portalApiUrl}${this.config.paymentTrackingEndpoint}`,
        {
          params: {
            ipNumber: this.config.ipNumber,
            month: month,
            year: year.toString(),
          },
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.config.ipNumber}:${this.config.ipPassword}`).toString('base64')}`,
          },
          timeout: 10000,
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          paymentStatus: response.data.paymentStatus, // Paid/Pending/Failed
          paymentDate: response.data.paymentDate,
          challanNumber: response.data.challanNumber,
          amount: response.data.amount,
          message: response.data.message,
        };
      } else {
        return {
          success: false,
          message: response.data?.message || 'Payment status unavailable',
        };
      }
    } catch (error) {
      // If API is not available, return placeholder
      return {
        success: false,
        message: `Payment tracking API unavailable: ${error.message}`,
        apiAvailable: false,
      };
    }
  }

  /**
   * Handle employee addition/removal
   * BRD: BR-INT-ESIC-002 - Handle employee addition/removal
   */
  async syncEmployeeChanges(newEmployees, removedEmployees) {
    try {
      const additions = newEmployees.map(emp => ({
        ipMemberId: emp.esiNumber,
        memberName: `${emp.firstName} ${emp.lastName}`,
        joiningDate: emp.joiningDate,
        grossWages: emp.basicSalary + emp.da + emp.hra + emp.allowances,
      }));

      const removals = removedEmployees.map(emp => ({
        ipMemberId: emp.esiNumber,
        memberName: `${emp.firstName} ${emp.lastName}`,
        exitDate: emp.exitDate,
        lastGrossWages: emp.lastBasicSalary + emp.lastDA + emp.lastHRA + emp.lastAllowances,
      }));

      return {
        additions,
        removals,
        totalAdditions: additions.length,
        totalRemovals: removals.length,
      };
    } catch (error) {
      throw new Error(`Employee sync failed: ${error.message}`);
    }
  }
}

module.exports = ESICService;

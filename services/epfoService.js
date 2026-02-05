/**
 * EPFO Integration Service
 * BRD Requirement: BR-INT-EPFO-001, BR-PAY-003
 * Handles ECR file generation, SFTP upload, acknowledgment download, and UAN validation
 */

const Client = require('ssh2-sftp-client');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class EPFOService {
  constructor(config) {
    this.config = config || {
      // SFTP Configuration for EPFO Portal
      sftpHost: process.env.EPFO_SFTP_HOST || 'sftp.epfindia.gov.in',
      sftpPort: process.env.EPFO_SFTP_PORT || 22,
      sftpUsername: process.env.EPFO_SFTP_USERNAME,
      sftpPassword: process.env.EPFO_SFTP_PASSWORD,
      sftpPrivateKey: process.env.EPFO_SFTP_PRIVATE_KEY,
      sftpRemotePath: process.env.EPFO_SFTP_REMOTE_PATH || '/ecr/uploads',
      sftpAckPath: process.env.EPFO_SFTP_ACK_PATH || '/ecr/acknowledgments',
      
      // EPFO Portal API Configuration
      portalApiUrl: process.env.EPFO_PORTAL_API_URL || 'https://unifiedportal-epfo.epfindia.gov.in',
      establishmentId: process.env.EPFO_ESTABLISHMENT_ID,
      establishmentPassword: process.env.EPFO_ESTABLISHMENT_PASSWORD,
      
      // UAN Validation API
      uanApiUrl: process.env.EPFO_UAN_API_URL || 'https://unifiedportal-epfo.epfindia.gov.in/api/uan',
      
      // File storage
      tempDir: process.env.TEMP_DIR || path.join(__dirname, '../../temp'),
    };
  }

  /**
   * Generate ECR file in EPFO-specified format
   * BRD: BR-PAY-003 - Generate ECR file in EPFO-specified format
   */
  async generateECRFile(payrolls, month, year) {
    try {
      const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month);
      const ncpDays = monthIndex !== -1 ? new Date(year, monthIndex + 1, 0).getDate() : 30;

      // EPFO ECR Format (as per EPFO specifications)
      // Header: ESTABLISHMENT_ID|MONTH|YEAR|TOTAL_MEMBERS|TOTAL_WAGES|TOTAL_EPF|TOTAL_EPS|TOTAL_EPF_DIFF
      // Records: UAN|MEMBER_NAME|PF_ACCOUNT|WAGES|EPF|EPS|EPF_DIFF|NCP_DAYS

      let totalWages = 0;
      let totalEPF = 0;
      let totalEPS = 0;
      let totalEPFDiff = 0;

      const records = payrolls
        .filter(p => p.pfDeduction > 0 && p.employeeId?.uan)
        .map(payroll => {
          const employee = payroll.employeeId;
          const uan = employee?.uan || '';
          const memberName = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
          const pfAccount = employee?.pfNumber || '';
          const wages = (payroll.basicSalary || 0) + (payroll.da || 0); // EPF on Basic+DA
          const epf = payroll.pfDeduction || 0;
          const eps = Math.round(wages * 0.0833); // EPS: 8.33% of wages
          const epfDiff = (payroll.employerEPF || 0) - eps; // Difference goes to EPF

          totalWages += wages;
          totalEPF += epf;
          totalEPS += eps;
          totalEPFDiff += epfDiff;

          return `${uan}|${memberName}|${pfAccount}|${wages}|${epf}|${eps}|${epfDiff}|${ncpDays}`;
        });

      if (records.length === 0) {
        throw new Error('No EPF contributions found for the specified period');
      }

      // Generate header
      const header = `${this.config.establishmentId}|${monthIndex + 1}|${year}|${records.length}|${totalWages}|${totalEPF}|${totalEPS}|${totalEPFDiff}`;
      
      // Combine header and records
      const fileContent = [header, ...records].join('\n');

      // Generate file hash for validation
      const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');

      return {
        fileContent,
        fileName: `ECR_${this.config.establishmentId}_${monthIndex + 1}_${year}_${Date.now()}.txt`,
        recordCount: records.length,
        totalWages,
        totalEPF,
        totalEPS,
        totalEPFDiff,
        fileHash,
      };
    } catch (error) {
      throw new Error(`ECR file generation failed: ${error.message}`);
    }
  }

  /**
   * Upload ECR file to EPFO portal via SFTP
   * BRD: BR-INT-EPFO-001 - Upload to EPFO portal via SFTP
   */
  async uploadECRFile(fileContent, fileName) {
    const sftp = new Client();
    let tempFilePath = null;

    try {
      // Ensure temp directory exists
      await fs.mkdir(this.config.tempDir, { recursive: true });
      
      // Write file to temp location
      tempFilePath = path.join(this.config.tempDir, fileName);
      await fs.writeFile(tempFilePath, fileContent, 'utf8');

      // Connect to SFTP server
      const sftpConfig = {
        host: this.config.sftpHost,
        port: this.config.sftpPort,
        username: this.config.sftpUsername,
        password: this.config.sftpPassword,
      };

      if (this.config.sftpPrivateKey) {
        sftpConfig.privateKey = this.config.sftpPrivateKey;
      }

      await sftp.connect(sftpConfig);

      // Upload file to remote path
      const remoteFilePath = `${this.config.sftpRemotePath}/${fileName}`;
      await sftp.put(tempFilePath, remoteFilePath);

      // Close SFTP connection
      await sftp.end();

      // Clean up temp file
      await fs.unlink(tempFilePath);

      return {
        success: true,
        remoteFilePath,
        uploadedAt: new Date(),
        message: 'ECR file uploaded successfully to EPFO portal',
      };
    } catch (error) {
      // Clean up temp file on error
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (unlinkError) {
          console.error('Failed to delete temp file:', unlinkError);
        }
      }

      // Close SFTP connection if still open
      if (sftp && sftp.client) {
        try {
          await sftp.end();
        } catch (endError) {
          console.error('Failed to close SFTP connection:', endError);
        }
      }

      throw new Error(`EPFO SFTP upload failed: ${error.message}`);
    }
  }

  /**
   * Download acknowledgment and challan from EPFO portal
   * BRD: BR-INT-EPFO-001 - Download acknowledgment and challan
   */
  async downloadAcknowledgment(fileName, month, year) {
    const sftp = new Client();

    try {
      // Connect to SFTP server
      const sftpConfig = {
        host: this.config.sftpHost,
        port: this.config.sftpPort,
        username: this.config.sftpUsername,
        password: this.config.sftpPassword,
      };

      if (this.config.sftpPrivateKey) {
        sftpConfig.privateKey = this.config.sftpPrivateKey;
      }

      await sftp.connect(sftpConfig);

      // Generate acknowledgment file name (EPFO naming convention)
      const ackFileName = fileName.replace('.txt', '_ACK.txt');
      const remoteAckPath = `${this.config.sftpAckPath}/${ackFileName}`;

      // Check if acknowledgment exists
      const fileExists = await sftp.exists(remoteAckPath);
      
      if (!fileExists) {
        await sftp.end();
        return {
          success: false,
          message: 'Acknowledgment file not yet available. Please check again later.',
        };
      }

      // Download acknowledgment file
      const ackContent = await sftp.get(remoteAckPath);
      
      // Parse acknowledgment (EPFO format)
      const ackText = ackContent.toString('utf8');
      const ackLines = ackText.split('\n').filter(line => line.trim());
      
      // Parse acknowledgment data
      // Format: ESTABLISHMENT_ID|MONTH|YEAR|STATUS|ACKNOWLEDGMENT_NUMBER|CHALLAN_NUMBER|DATE|MESSAGE
      const ackData = {};
      if (ackLines.length > 0) {
        const parts = ackLines[0].split('|');
        ackData.establishmentId = parts[0];
        ackData.month = parts[1];
        ackData.year = parts[2];
        ackData.status = parts[3]; // SUCCESS/FAILED
        ackData.acknowledgmentNumber = parts[4];
        ackData.challanNumber = parts[5];
        ackData.date = parts[6];
        ackData.message = parts[7] || '';
      }

      await sftp.end();

      return {
        success: true,
        acknowledgmentNumber: ackData.acknowledgmentNumber,
        challanNumber: ackData.challanNumber,
        status: ackData.status,
        date: ackData.date,
        message: ackData.message,
        rawContent: ackText,
      };
    } catch (error) {
      if (sftp && sftp.client) {
        try {
          await sftp.end();
        } catch (endError) {
          console.error('Failed to close SFTP connection:', endError);
        }
      }
      throw new Error(`Failed to download EPFO acknowledgment: ${error.message}`);
    }
  }

  /**
   * Validate UAN numbers in real-time
   * BRD: BR-INT-EPFO-001 - Validate UAN numbers in real-time
   */
  async validateUAN(uan) {
    try {
      // EPFO UAN Validation API call
      // Note: Actual EPFO API may require authentication and specific format
      const response = await axios.post(
        `${this.config.uanApiUrl}/validate`,
        {
          uan: uan,
          establishmentId: this.config.establishmentId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EPFO_API_TOKEN || ''}`,
          },
          timeout: 10000,
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          valid: true,
          uan: response.data.uan,
          memberName: response.data.memberName,
          status: response.data.memberStatus, // Active/Inactive
          pfAccount: response.data.pfAccount,
          message: 'UAN validated successfully',
        };
      } else {
        return {
          valid: false,
          message: response.data?.message || 'UAN validation failed',
        };
      }
    } catch (error) {
      // If API is not available, return basic validation
      // UAN format: 12 digits
      const uanRegex = /^\d{12}$/;
      const isValidFormat = uanRegex.test(uan);

      return {
        valid: isValidFormat,
        message: isValidFormat 
          ? 'UAN format is valid (API validation unavailable)' 
          : 'Invalid UAN format. UAN must be 12 digits.',
        apiAvailable: false,
      };
    }
  }

  /**
   * Bulk validate UANs
   */
  async validateUANs(uans) {
    const results = [];
    
    for (const uan of uans) {
      try {
        const result = await this.validateUAN(uan);
        results.push({
          uan,
          ...result,
        });
        
        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          uan,
          valid: false,
          message: `Validation error: ${error.message}`,
        });
      }
    }

    return results;
  }

  /**
   * Handle new joiner addition and exits
   * BRD: BR-INT-EPFO-001 - Handle new joiner addition and exits
   */
  async syncMemberChanges(newJoiners, exits) {
    try {
      // Generate member addition file
      const additionRecords = newJoiners.map(employee => {
        return {
          uan: employee.uan,
          memberName: `${employee.firstName} ${employee.lastName}`,
          pfAccount: employee.pfNumber,
          joiningDate: employee.joiningDate,
          wages: employee.basicSalary + employee.da,
        };
      });

      // Generate member exit file
      const exitRecords = exits.map(employee => {
        return {
          uan: employee.uan,
          memberName: `${employee.firstName} ${employee.lastName}`,
          pfAccount: employee.pfNumber,
          exitDate: employee.exitDate,
          lastWages: employee.lastBasicSalary + employee.lastDA,
        };
      });

      return {
        additions: additionRecords,
        exits: exitRecords,
        totalAdditions: additionRecords.length,
        totalExits: exitRecords.length,
      };
    } catch (error) {
      throw new Error(`Member sync failed: ${error.message}`);
    }
  }
}

module.exports = EPFOService;

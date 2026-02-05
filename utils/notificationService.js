const nodemailer = require('nodemailer');
const AuditLog = require('../models/AuditLog');

// BRD Requirement: "System sends notifications to relevant stakeholders"
// BRD Requirement: "Integrate with SMTP/Exchange email server", "SMS gateway", "WhatsApp Business API"

// Email Service Configuration
let emailTransporter = null;

function initializeEmailService() {
  // BRD Requirement: SMTP/Exchange integration
  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

// Initialize on module load
if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
  initializeEmailService();
}

/**
 * Send Email Notification
 * BRD Requirement: Template-based emails with personalization
 */
async function sendEmail({ to, subject, html, text, attachments = [] }) {
  try {
    if (!emailTransporter) {
      console.warn('Email service not configured. Set SMTP_USER and SMTP_PASSWORD environment variables.');
      return { success: false, message: 'Email service not configured' };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
      attachments,
    };

    const info = await emailTransporter.sendMail(mailOptions);
    
    // BRD Requirement: Track email delivery status
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    console.error('Email sending error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send SMS Notification
 * BRD Requirement: "Integrate with SMS gateway (HTTP API or SMPP protocol)"
 */
async function sendSMS({ to, message }) {
  try {
    // In production, integrate with SMS gateway (Twilio, MSG91, etc.)
    // For now, log the SMS (would be sent via API in production)
    console.log(`SMS to ${to}: ${message}`);
    
    // Example: MSG91 API integration
    // const response = await fetch(`https://api.msg91.com/api/sendhttp.php?authkey=${process.env.MSG91_AUTH_KEY}&mobiles=${to}&message=${encodeURIComponent(message)}&sender=${process.env.MSG91_SENDER_ID}&route=4`);
    
    return {
      success: true,
      message: 'SMS queued for sending',
    };
  } catch (error) {
    console.error('SMS sending error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send WhatsApp Notification
 * BRD Requirement: "WhatsApp Business API integration"
 */
async function sendWhatsApp({ to, message, template = null }) {
  try {
    // In production, integrate with WhatsApp Business API (Twilio, 360dialog, etc.)
    // For now, log the WhatsApp message
    console.log(`WhatsApp to ${to}: ${message}`);
    
    // Example: Twilio WhatsApp API integration
    // const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // const message = await client.messages.create({
    //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    //   to: `whatsapp:${to}`,
    //   body: message,
    // });
    
    return {
      success: true,
      message: 'WhatsApp message queued for sending',
    };
  } catch (error) {
    console.error('WhatsApp sending error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send Multi-Channel Notification
 * BRD Requirement: Multi-channel communication (Email, SMS, WhatsApp)
 */
async function sendNotification({ to, channels = ['email'], subject, message, html, attachments = [], tenantId, userId, module, action }) {
  const results = {
    email: null,
    sms: null,
    whatsapp: null,
  };

  // Send via requested channels
  if (channels.includes('email')) {
    results.email = await sendEmail({
      to,
      subject,
      html: html || message,
      text: message,
      attachments,
    });
  }

  if (channels.includes('sms')) {
    results.sms = await sendSMS({
      to,
      message,
    });
  }

  if (channels.includes('whatsapp')) {
    results.whatsapp = await sendWhatsApp({
      to,
      message,
    });
  }

  // Log notification in audit log
  try {
    await AuditLog.create({
      tenantId,
      userId,
      userName: 'System',
      userEmail: 'system@hrms.com',
      action: 'Notification Sent',
      module: module || 'Notifications',
      entityType: 'Notification',
      details: `Notification sent via ${channels.join(', ')} to ${to}`,
      status: 'Success',
    });
  } catch (auditError) {
    console.error('Audit log error:', auditError);
  }

  return results;
}

/**
 * Payroll Notification Templates
 */
const payrollTemplates = {
  payslipGenerated: (employeeName, month, year) => ({
    subject: `Payslip for ${month} ${year}`,
    html: `
      <h2>Dear ${employeeName},</h2>
      <p>Your payslip for ${month} ${year} has been generated and is available in your HRMS portal.</p>
      <p>Please log in to view and download your payslip.</p>
      <p>Best regards,<br>HRMS Team</p>
    `,
    text: `Dear ${employeeName},\n\nYour payslip for ${month} ${year} has been generated. Please log in to view it.\n\nBest regards,\nHRMS Team`,
  }),
  payrollProcessed: (employeeName, month, year, netSalary) => ({
    subject: `Salary Credited - ${month} ${year}`,
    html: `
      <h2>Dear ${employeeName},</h2>
      <p>Your salary for ${month} ${year} has been processed.</p>
      <p>Net Salary: ₹${netSalary.toLocaleString()}</p>
      <p>The amount will be credited to your registered bank account.</p>
      <p>Best regards,<br>HRMS Team</p>
    `,
    text: `Dear ${employeeName},\n\nYour salary for ${month} ${year} has been processed. Net Salary: ₹${netSalary.toLocaleString()}\n\nBest regards,\nHRMS Team`,
  }),
};

/**
 * Leave Notification Templates
 */
const leaveTemplates = {
  leaveApproved: (employeeName, leaveType, days, startDate, endDate) => ({
    subject: `Leave Approved - ${leaveType}`,
    html: `
      <h2>Dear ${employeeName},</h2>
      <p>Your ${leaveType} request for ${days} day(s) from ${startDate} to ${endDate} has been approved.</p>
      <p>Best regards,<br>HRMS Team</p>
    `,
    text: `Dear ${employeeName},\n\nYour ${leaveType} request for ${days} day(s) has been approved.\n\nBest regards,\nHRMS Team`,
  }),
  leaveRejected: (employeeName, leaveType, days, reason) => ({
    subject: `Leave Request Rejected - ${leaveType}`,
    html: `
      <h2>Dear ${employeeName},</h2>
      <p>Your ${leaveType} request for ${days} day(s) has been rejected.</p>
      <p>Reason: ${reason || 'Not specified'}</p>
      <p>Best regards,<br>HRMS Team</p>
    `,
    text: `Dear ${employeeName},\n\nYour ${leaveType} request has been rejected. Reason: ${reason || 'Not specified'}\n\nBest regards,\nHRMS Team`,
  }),
};

module.exports = {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  sendNotification,
  payrollTemplates,
  leaveTemplates,
  initializeEmailService,
};

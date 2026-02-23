/**
 * BILLING SERVICE - CRITICAL FOR SAAS REVENUE MODEL
 * File: backend/services/BillingService.js
 * Purpose: Calculate monthly bills, generate invoices, track usage-based billing
 * 
 * BRD References:
 * - Lines 2058-2156: calculateMonthlyBill() requirements
 * - Lines 2157-2203: generateInvoice() & PDF generation
 * - Pricing Models: FLAT_FEE, PER_USER, PER_TRANSACTION, BUNDLED
 * - GST: 18% for India
 */

const mongoose = require('mongoose');
const pdfkit = require('pdfkit');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const moment = require('moment');

class BillingService {
  constructor() {
    this.taxRate = 0.18; // 18% GST for India
    this.invoiceDir = path.join(__dirname, '../../uploads/invoices');
    this.emailService = nodemailer.createTransporter({
      // Configure based on your email setup
    });
  }

  /**
   * Calculate monthly bill for a company based on active modules and pricing models
   * 
   * @param {String} companyId - Company tenant ID
   * @param {String} billingMonth - Format: "2026-02" (YYYY-MM)
   * @returns {Object} Bill breakdown with line items, subtotal, tax, total
   */
  async calculateMonthlyBill(companyId, billingMonth) {
    try {
      // Validate inputs
      if (!companyId || !billingMonth) {
        throw new Error('companyId and billingMonth are required');
      }

      // Get all active modules for the company
      const activeModules = await mongoose.model('CompanyModule').find({
        tenantId: companyId,
        is_enabled: true,
      }).populate('moduleId');

      if (!activeModules || activeModules.length === 0) {
        return {
          companyId,
          billingMonth,
          lineItems: [],
          subtotal: 0,
          gst: 0,
          grandTotal: 0,
          currency: 'INR',
          status: 'NO_BILLABLE_ITEMS',
        };
      }

      let subtotal = 0;
      const lineItems = [];

      // Process each active module
      for (const companyModule of activeModules) {
        let moduleCost = 0;
        const module = companyModule.moduleId;

        // Get module usage metrics from ModuleUsageLog for billing period
        const [startDate, endDate] = this.getBillingPeriodDates(billingMonth);
        const usageMetrics = await this.getModuleUsageMetrics(
          companyId,
          module._id,
          startDate,
          endDate
        );

        // Calculate cost based on pricing model
        const lineItem = await this.calculateModuleCost(
          companyModule,
          module,
          usageMetrics
        );

        lineItems.push(lineItem);
        moduleCost = lineItem.total;
        subtotal += moduleCost;
      }

      // Get company subscription package cost (if any)
      const subscription = await mongoose.model('CompanySubscription').findOne({
        tenantId: companyId,
        status: 'ACTIVE',
      });

      if (subscription && subscription.subscription_type === 'PACKAGE_BASED') {
        lineItems.unshift({
          description: `${subscription.package_name} - Package Base Cost`,
          pricingModel: 'PACKAGE',
          quantity: 1,
          unitPrice: subscription.base_cost,
          total: subscription.base_cost,
          module: 'Base Subscription',
        });
        subtotal += parseFloat(subscription.base_cost || 0);
      }

      // Calculate taxes (18% GST)
      const gst = subtotal * this.taxRate;
      const grandTotal = subtotal + gst;

      return {
        companyId,
        billingMonth,
        lineItems,
        subtotal: Math.round(subtotal * 100) / 100,
        gst: Math.round(gst * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100,
        currency: 'INR',
        calculatedAt: new Date(),
      };
    } catch (error) {
      console.error('Error calculating monthly bill:', error);
      throw error;
    }
  }

  /**
   * Calculate cost for a single module based on its pricing model
   * Supports: FLAT_FEE, PER_USER, PER_TRANSACTION, BUNDLED
   */
  async calculateModuleCost(companyModule, module, usageMetrics) {
    const pricingModel = companyModule.pricing_model;
    let moduleCost = 0;
    let description = `${module.module_name}`;

    switch (pricingModel) {
      case 'FLAT_FEE':
        moduleCost = parseFloat(companyModule.monthly_cost || 0);
        description += ` - Flat Monthly Fee`;
        return {
          description,
          module: module.module_name,
          moduleId: module._id,
          pricingModel: 'Flat Fee',
          quantity: 1,
          unitPrice: moduleCost,
          total: moduleCost,
          usage: null,
        };

      case 'PER_USER':
        const userCount = companyModule.current_user_count || usageMetrics.uniqueUsers || 0;
        const perUserCost = parseFloat(companyModule.monthly_cost || 0);
        moduleCost = userCount * perUserCost;
        description += ` - ${userCount} users × ₹${perUserCost}`;
        return {
          description,
          module: module.module_name,
          moduleId: module._id,
          pricingModel: 'Per User',
          quantity: userCount,
          unitPrice: perUserCost,
          total: moduleCost,
          usage: { users: userCount },
        };

      case 'PER_TRANSACTION':
        const txnCount = companyModule.current_transaction_count || usageMetrics.totalActions || 0;
        const perTxnCost = parseFloat(companyModule.monthly_cost || 0);
        moduleCost = txnCount * perTxnCost;
        description += ` - ${txnCount} transactions × ₹${perTxnCost}`;
        return {
          description,
          module: module.module_name,
          moduleId: module._id,
          pricingModel: 'Per Transaction',
          quantity: txnCount,
          unitPrice: perTxnCost,
          total: moduleCost,
          usage: { transactions: txnCount },
        };

      case 'BUNDLED':
        // Bundled modules are included in package, no separate charge
        return {
          description: `${module.module_name} - Included in subscription`,
          module: module.module_name,
          moduleId: module._id,
          pricingModel: 'Bundled',
          quantity: 1,
          unitPrice: 0,
          total: 0,
          usage: null,
          note: 'Included in subscription package',
        };

      default:
        throw new Error(`Unknown pricing model: ${pricingModel}`);
    }
  }

  /**
   * Get usage metrics for a module during a billing period
   */
  async getModuleUsageMetrics(companyId, moduleId, startDate, endDate) {
    const ModuleUsageLog = mongoose.model('ModuleUsageLog');

    const logs = await ModuleUsageLog.find({
      tenantId: companyId,
      moduleId,
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    // Count unique users
    const uniqueUsersSet = new Set(logs.map(log => log.userId));

    return {
      totalActions: logs.length,
      uniqueUsers: uniqueUsersSet.size,
      startDate,
      endDate,
    };
  }

  /**
   * Generate invoice and create invoice record in database
   * 
   * @param {String} companyId - Company tenant ID
   * @param {String} billingMonth - Format: "2026-02"
   * @returns {Object} Created invoice document
   */
  async generateInvoice(companyId, billingMonth) {
    try {
      // Calculate the bill
      const bill = await this.calculateMonthlyBill(companyId, billingMonth);

      if (bill.lineItems.length === 0) {
        return {
          status: 'SKIPPED',
          reason: 'No billable items',
          companyId,
          billingMonth,
        };
      }

      // Get company and billing details
      const company = await mongoose.model('Tenant').findById(companyId);
      const billingContact = await this.getBillingContact(companyId);

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(companyId, billingMonth);

      // Calculate due date (15 days payment term)
      const invoiceDate = moment(billingMonth, 'YYYY-MM').toDate();
      const dueDate = moment(invoiceDate).add(15, 'days').toDate();

      // Create invoice record in database
      const Invoice = mongoose.model('Invoice');
      const invoice = await Invoice.create({
        tenantId: companyId,
        invoiceNumber,
        billingPeriod: billingMonth,
        invoiceDate,
        dueDate,
        companyName: company.name,
        billingContact: {
          name: billingContact?.name,
          email: billingContact?.email,
          phone: billingContact?.phone,
          address: billingContact?.address,
        },
        lineItems: bill.lineItems,
        subtotal: bill.subtotal,
        taxAmount: bill.gst,
        taxRate: (this.taxRate * 100),
        totalAmount: bill.grandTotal,
        currency: bill.currency,
        status: 'GENERATED',
        paymentStatus: 'PENDING',
        createdAt: new Date(),
      });

      // Generate PDF document
      const pdfPath = await this.generateInvoicePDF(invoice, bill);

      // Update invoice with PDF path
      invoice.pdfPath = pdfPath;
      await invoice.save();

      // Create payment tracking record
      const Payment = mongoose.model('Payment');
      await Payment.create({
        invoiceId: invoice._id,
        companyId,
        amount: bill.grandTotal,
        status: 'AWAITING_PAYMENT',
        dueDate,
      });

      // Send invoice email
      await this.emailInvoice(invoice, billingContact, pdfPath);

      // Log in audit trail
      await this.logBillingAction(companyId, 'INVOICE_GENERATED', {
        invoiceId: invoice._id,
        invoiceNumber,
        amount: bill.grandTotal,
      });

      console.log(`Invoice ${invoiceNumber} generated successfully for ${company.name}`);

      return {
        status: 'SUCCESS',
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: bill.grandTotal,
        dueDate,
      };
    } catch (error) {
      console.error('Error generating invoice:', error);
      throw error;
    }
  }

  /**
   * Generate PDF invoice document with logo, company details, line items, taxes
   */
  async generateInvoicePDF(invoice, bill) {
    return new Promise((resolve, reject) => {
      try {
        // Create uploads/invoices directory if not exists
        if (!fs.existsSync(this.invoiceDir)) {
          fs.mkdirSync(this.invoiceDir, { recursive: true });
        }

        const filename = `${invoice.invoiceNumber}.pdf`;
        const filepath = path.join(this.invoiceDir, filename);
        const doc = new pdfkit();
        const stream = fs.createWriteStream(filepath);

        doc.pipe(stream);

        // Header - Company Logo & Title
        doc.fontSize(20).text('INVOICE', 50, 50);
        doc.fontSize(10)
          .text('Platform HRMS', 50, 80)
          .text('Multi-Tenant Enterprise Solution', 50, 100);

        // Invoice Details
        doc.fontSize(11).text(`Invoice #: ${invoice.invoiceNumber}`, 400, 50);
        doc.text(`Date: ${moment(invoice.invoiceDate).format('DD MMM YYYY')}`, 400, 70);
        doc.text(`Due Date: ${moment(invoice.dueDate).format('DD MMM YYYY')}`, 400, 90);

        // Bill To Section
        doc.fontSize(12).text('Bill To:', 50, 150);
        doc.fontSize(10)
          .text(invoice.billingContact.name || 'N/A', 50, 170)
          .text(invoice.companyName, 50, 185)
          .text(invoice.billingContact.email || 'N/A', 50, 200)
          .text(invoice.billingContact.phone || 'N/A', 50, 215);

        // Line Items Table
        const tableTop = 280;
        const col1 = 50;
        const col2 = 250;
        const col3 = 350;
        const col4 = 450;

        doc.fontSize(11).font('Helvetica-Bold')
          .text('Description', col1, tableTop)
          .text('Qty', col2, tableTop)
          .text('Unit Price', col3, tableTop)
          .text('Total', col4, tableTop);

        // Draw line
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        let yPosition = tableTop + 30;
        doc.font('Helvetica').fontSize(10);

        bill.lineItems.forEach((item) => {
          doc.text(item.description || item.module, col1, yPosition, { width: 180 })
            .text(item.quantity, col2, yPosition)
            .text(`₹${item.unitPrice.toFixed(2)}`, col3, yPosition)
            .text(`₹${item.total.toFixed(2)}`, col4, yPosition);

          yPosition += 25;
        });

        // Draw line before totals
        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

        yPosition += 15;

        // Totals
        doc.fontSize(11).font('Helvetica');
        doc.text('Subtotal:', col3, yPosition).text(`₹${bill.subtotal.toFixed(2)}`, col4, yPosition);
        yPosition += 20;
        doc.text(`GST (${invoice.taxRate}%):`, col3, yPosition)
          .text(`₹${bill.gst.toFixed(2)}`, col4, yPosition);
        yPosition += 20;
        doc.font('Helvetica-Bold').fontSize(12)
          .text('Total Amount Due:', col3, yPosition)
          .text(`₹${bill.grandTotal.toFixed(2)}`, col4, yPosition);

        // Payment Terms
        yPosition += 50;
        doc.fontSize(10).font('Helvetica')
          .text('Payment Terms:', 50, yPosition)
          .text('Net 15 days from invoice date', 50, yPosition + 15)
          .text('Please include invoice number in your payment', 50, yPosition + 30);

        // Footer
        doc.fontSize(8).text('Thank you for your business!', 50, 750);

        doc.end();

        stream.on('finish', () => {
          resolve(filepath);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send invoice email to billing contact with PDF attachment
   */
  async emailInvoice(invoice, billingContact, pdfPath) {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM_EMAIL || 'billing@platform-hrms.com',
        to: billingContact?.email || invoice.billingContact.email,
        subject: `Invoice ${invoice.invoiceNumber} - Platform HRMS`,
        html: `
          <h2>Invoice Details</h2>
          <p>Dear ${billingContact?.name || 'Customer'},</p>
          <p>Please find attached your invoice for the billing period of ${invoice.billingPeriod}.</p>
          <table style="border-collapse: collapse; width: 100%;">
            ${invoice.lineItems.map(item => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.description}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">₹${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr style="background-color: #f2f2f2;">
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Subtotal</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">₹${invoice.subtotal?.toFixed(2)}</td>
            </tr>
            <tr style="background-color: #f2f2f2;">
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>GST (18%)</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">₹${invoice.taxAmount?.toFixed(2)}</td>
            </tr>
            <tr style="background-color: #e8f2f7;">
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Amount Due</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;"><strong>₹${invoice.totalAmount?.toFixed(2)}</strong></td>
            </tr>
          </table>
          <p><strong>Due Date: ${moment(invoice.dueDate).format('DD MMM YYYY')}</strong></p>
          <p>Please remit payment within 15 days of invoice date.</p>
          <p>Best regards,<br/>Platform HRMS Billing Team</p>
        `,
        attachments: [{
          filename: `${invoice.invoiceNumber}.pdf`,
          path: pdfPath,
        }],
      };

      await this.emailService.sendMail(mailOptions);
      console.log(`Invoice email sent to ${billingContact?.email}`);
    } catch (error) {
      console.error('Error sending invoice email:', error);
      // Don't throw - email failure shouldn't block invoice creation
    }
  }

  /**
   * Get billing contact for a company
   */
  async getBillingContact(companyId) {
    const User = mongoose.model('User');
    return await User.findOne({
      tenantId: companyId,
      roles: 'COMPANY_ADMIN',
      is_active: true,
    });
  }

  /**
   * Generate unique invoice number for a company and month
   */
  async generateInvoiceNumber(companyId, billingMonth) {
    const Invoice = mongoose.model('Invoice');
    const company = await mongoose.model('Tenant').findById(companyId);
    
    const monthValue = billingMonth.replace('-', '');
    const lastInvoiceCount = await Invoice.countDocuments({
      tenantId: companyId,
      invoiceNumber: new RegExp(`INV-${monthValue}`),
    });

    return `INV-${monthValue}-${String(lastInvoiceCount + 1).padStart(5, '0')}`;
  }

  /**
   * Get billing period dates from billing month string
   */
  getBillingPeriodDates(billingMonth) {
    const startDate = moment(billingMonth, 'YYYY-MM').startOf('month').toDate();
    const endDate = moment(billingMonth, 'YYYY-MM').endOf('month').toDate();
    return [startDate, endDate];
  }

  /**
   * Log billing action in audit trail
   */
  async logBillingAction(companyId, action, details) {
    const AuditLog = mongoose.model('AuditLog');
    await AuditLog.create({
      tenantId: companyId,
      userId: 'SYSTEM',
      action,
      module: 'BILLING',
      entityType: 'INVOICE',
      details,
      timestamp: new Date(),
    });
  }

  /**
   * Update module usage counts (called periodically or on specific actions)
   */
  async updateModuleUsageCount(companyId, moduleId, usageType) {
    const CompanyModule = mongoose.model('CompanyModule');
    
    if (usageType === 'USER_ACCESS') {
      // Count unique users in last 30 days
      const ModuleUsageLog = mongoose.model('ModuleUsageLog');
      const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
      
      const uniqueUsers = await ModuleUsageLog.distinct('userId', {
        tenantId: companyId,
        moduleId,
        timestamp: { $gte: thirtyDaysAgo },
      });

      await CompanyModule.updateOne(
        { tenantId: companyId, moduleId },
        { current_user_count: uniqueUsers.length }
      );
    }
  }
}

module.exports = new BillingService();

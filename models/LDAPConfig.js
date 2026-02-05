/**
 * LDAP/Active Directory Configuration Model
 * BRD Requirement: BR-UAM-007 (SSO, user sync, role mapping)
 */

const mongoose = require('mongoose');

const ldapConfigSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
    index: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  serverUrl: {
    type: String,
    required: function() { return this.enabled; },
  },
  bindDN: {
    type: String,
    required: function() { return this.enabled; },
  },
  bindPassword: {
    type: String,
    required: function() { return this.enabled; },
    select: false, // Don't return password by default
  },
  baseDN: {
    type: String,
    required: function() { return this.enabled; },
  },
  userSearchBase: {
    type: String,
    default: '',
  },
  groupSearchBase: {
    type: String,
    default: '',
  },
  sslEnabled: {
    type: Boolean,
    default: false,
  },
  syncInterval: {
    type: Number,
    default: 24, // hours
  },
  lastSyncDate: Date,
  lastSyncStatus: {
    type: String,
    enum: ['Success', 'Failed', 'In Progress'],
  },
  lastSyncError: String,
  roleMappings: [{
    ldapGroup: {
      type: String,
      required: true,
    },
    systemRole: {
      type: String,
      enum: [
        'Super Admin',
        'Tenant Admin',
        'HR Administrator',
        'Payroll Administrator',
        'Finance Administrator',
        'Manager',
        'Employee',
        'Auditor',
      ],
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  ssoEnabled: {
    type: Boolean,
    default: false,
  },
  ssoProvider: {
    type: String,
    enum: ['SAML', 'LDAP', 'OAuth'],
  },
  samlConfig: {
    entryPoint: String,
    issuer: String,
    cert: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ldapConfigSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('LDAPConfig', ldapConfigSchema);

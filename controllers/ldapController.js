/**
 * LDAP/Active Directory Controller
 * BRD Requirement: BR-UAM-007
 */

const LDAPConfig = require('../models/LDAPConfig');
const LDAPService = require('../services/ldapService');
const User = require('../models/User');
const { createAuditLog } = require('../utils/auditLog');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

// @desc    Get LDAP configuration
// @route   GET /api/ldap/config
// @access  Private (Tenant Admin, Super Admin)
exports.getLDAPConfig = asyncHandler(async (req, res) => {
  const config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (!config) {
    return res.status(200).json({
      success: true,
      data: {
        enabled: false,
        roleMappings: [],
      },
    });
  }

  // Don't return password
  const configData = config.toObject();
  delete configData.bindPassword;

  res.status(200).json({
    success: true,
    data: configData,
  });
});

// @desc    Update LDAP configuration
// @route   PUT /api/ldap/config
// @access  Private (Tenant Admin, Super Admin)
exports.updateLDAPConfig = asyncHandler(async (req, res) => {
  const {
    enabled,
    serverUrl,
    bindDN,
    bindPassword,
    baseDN,
    userSearchBase,
    groupSearchBase,
    sslEnabled,
    syncInterval,
    ssoEnabled,
    ssoProvider,
    samlConfig,
  } = req.body;

  let config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (config) {
    config.enabled = enabled !== undefined ? enabled : config.enabled;
    config.serverUrl = serverUrl || config.serverUrl;
    config.bindDN = bindDN || config.bindDN;
    if (bindPassword) config.bindPassword = bindPassword;
    config.baseDN = baseDN || config.baseDN;
    config.userSearchBase = userSearchBase !== undefined ? userSearchBase : config.userSearchBase;
    config.groupSearchBase = groupSearchBase !== undefined ? groupSearchBase : config.groupSearchBase;
    config.sslEnabled = sslEnabled !== undefined ? sslEnabled : config.sslEnabled;
    config.syncInterval = syncInterval || config.syncInterval;
    config.ssoEnabled = ssoEnabled !== undefined ? ssoEnabled : config.ssoEnabled;
    config.ssoProvider = ssoProvider || config.ssoProvider;
    if (samlConfig) config.samlConfig = samlConfig;
  } else {
    config = await LDAPConfig.create({
      tenantId: req.tenantId,
      enabled,
      serverUrl,
      bindDN,
      bindPassword,
      baseDN,
      userSearchBase,
      groupSearchBase,
      sslEnabled,
      syncInterval,
      ssoEnabled,
      ssoProvider,
      samlConfig,
    });
  }

  await config.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'LDAP Config Updated',
    module: 'UAM',
    entityType: 'LDAPConfig',
    description: 'LDAP configuration updated',
  });

  const configData = config.toObject();
  delete configData.bindPassword;

  res.status(200).json({
    success: true,
    message: 'LDAP configuration updated successfully',
    data: configData,
  });
});

// @desc    Test LDAP connection
// @route   POST /api/ldap/test
// @access  Private (Tenant Admin, Super Admin)
exports.testLDAPConnection = asyncHandler(async (req, res) => {
  const config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (!config || !config.enabled) {
    return res.status(400).json({
      success: false,
      message: 'LDAP is not configured or enabled',
    });
  }

  const ldapService = new LDAPService(config);
  
  try {
    await ldapService.connect();
    ldapService.disconnect();

    res.status(200).json({
      success: true,
      message: 'LDAP connection successful',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'LDAP connection failed',
      error: error.message,
    });
  }
});

// @desc    Sync users from LDAP
// @route   POST /api/ldap/sync
// @access  Private (Tenant Admin, Super Admin)
exports.syncLDAPUsers = asyncHandler(async (req, res) => {
  const config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (!config || !config.enabled) {
    return res.status(400).json({
      success: false,
      message: 'LDAP is not configured or enabled',
    });
  }

  // Update sync status
  config.lastSyncStatus = 'In Progress';
  await config.save();

  const ldapService = new LDAPService(config);
  let syncedCount = 0;
  let errorCount = 0;

  try {
    await ldapService.connect();

    // Search for all users
    const ldapUsers = await ldapService.searchUsers('(objectClass=person)', [
      'sAMAccountName',
      'mail',
      'displayName',
      'memberOf',
      'cn',
    ]);

    for (const ldapUser of ldapUsers) {
      try {
        const username = ldapUser.sAMAccountName || ldapUser.cn;
        const email = ldapUser.mail || `${username}@${config.baseDN.split(',')[0].replace('dc=', '')}`;
        const name = ldapUser.displayName || ldapUser.cn || username;
        const groups = ldapUser.memberOf || [];

        // Map LDAP groups to system role
        const systemRole = ldapService.mapGroupToRole(groups, config.roleMappings);

        // Check if user exists
        let user = await User.findOne({
          tenantId: req.tenantId,
          $or: [{ email }, { username }],
        });

        if (user) {
          // Update existing user
          user.name = name;
          user.role = systemRole;
          await user.save();
        } else {
          // Create new user (without password - they'll use LDAP auth)
          user = await User.create({
            tenantId: req.tenantId,
            email,
            username,
            name,
            role: systemRole,
            status: 'Active',
            password: crypto.randomBytes(32).toString('hex'), // Random password, not used for LDAP auth
            passwordChangeRequired: false,
          });
        }

        syncedCount++;
      } catch (error) {
        console.error(`Error syncing user ${ldapUser.sAMAccountName}:`, error);
        errorCount++;
      }
    }

    ldapService.disconnect();

    // Update sync status
    config.lastSyncDate = new Date();
    config.lastSyncStatus = 'Success';
    await config.save();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'LDAP User Sync',
      module: 'UAM',
      entityType: 'User',
      description: `Synced ${syncedCount} users from LDAP. Errors: ${errorCount}`,
    });

    res.status(200).json({
      success: true,
      message: `Synced ${syncedCount} users successfully`,
      data: {
        syncedCount,
        errorCount,
      },
    });
  } catch (error) {
    config.lastSyncStatus = 'Failed';
    config.lastSyncError = error.message;
    await config.save();

    res.status(500).json({
      success: false,
      message: 'LDAP sync failed',
      error: error.message,
    });
  }
});

// @desc    Get LDAP users
// @route   GET /api/ldap/users
// @access  Private (Tenant Admin, Super Admin)
exports.getLDAPUsers = asyncHandler(async (req, res) => {
  const config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (!config || !config.enabled) {
    return res.status(400).json({
      success: false,
      message: 'LDAP is not configured or enabled',
    });
  }

  const ldapService = new LDAPService(config);
  const { search } = req.query;

  try {
    await ldapService.connect();

    const searchFilter = search
      ? `(&(objectClass=person)(|(sAMAccountName=*${search}*)(displayName=*${search}*)(mail=*${search}*)))`
      : '(objectClass=person)';

    const users = await ldapService.searchUsers(searchFilter, [
      'sAMAccountName',
      'mail',
      'displayName',
      'memberOf',
      'cn',
    ]);

    ldapService.disconnect();

    res.status(200).json({
      success: true,
      data: users.map(u => ({
        username: u.sAMAccountName || u.cn,
        email: u.mail || '',
        name: u.displayName || u.cn || u.sAMAccountName,
        groups: u.memberOf || [],
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch LDAP users',
      error: error.message,
    });
  }
});

// @desc    Create role mapping
// @route   POST /api/ldap/role-mapping
// @access  Private (Tenant Admin, Super Admin)
exports.mapLDAPRole = asyncHandler(async (req, res) => {
  const { ldapGroup, systemRole } = req.body;

  if (!ldapGroup || !systemRole) {
    return res.status(400).json({
      success: false,
      message: 'LDAP group and system role are required',
    });
  }

  const config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (!config) {
    return res.status(404).json({
      success: false,
      message: 'LDAP configuration not found',
    });
  }

  // Check if mapping already exists
  const existingMapping = config.roleMappings.find(
    m => m.ldapGroup.toLowerCase() === ldapGroup.toLowerCase()
  );

  if (existingMapping) {
    existingMapping.systemRole = systemRole;
  } else {
    config.roleMappings.push({ ldapGroup, systemRole });
  }

  await config.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'LDAP Role Mapping Created',
    module: 'UAM',
    entityType: 'LDAPConfig',
    description: `Mapped LDAP group ${ldapGroup} to system role ${systemRole}`,
  });

  res.status(200).json({
    success: true,
    message: 'Role mapping created successfully',
    data: config.roleMappings,
  });
});

// @desc    Get role mappings
// @route   GET /api/ldap/role-mapping
// @access  Private (Tenant Admin, Super Admin)
exports.getLDAPRoleMappings = asyncHandler(async (req, res) => {
  const config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (!config) {
    return res.status(200).json({
      success: true,
      data: [],
    });
  }

  res.status(200).json({
    success: true,
    data: config.roleMappings,
  });
});

// @desc    Delete role mapping
// @route   DELETE /api/ldap/role-mapping/:id
// @access  Private (Tenant Admin, Super Admin)
exports.deleteLDAPRoleMapping = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const config = await LDAPConfig.findOne({ tenantId: req.tenantId });

  if (!config) {
    return res.status(404).json({
      success: false,
      message: 'LDAP configuration not found',
    });
  }

  config.roleMappings = config.roleMappings.filter(
    m => m._id.toString() !== id
  );

  await config.save();

  await createAuditLog({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: 'LDAP Role Mapping Deleted',
    module: 'UAM',
    entityType: 'LDAPConfig',
    description: `Deleted role mapping ${id}`,
  });

  res.status(200).json({
    success: true,
    message: 'Role mapping deleted successfully',
  });
});

// @desc    SSO Login (LDAP)
// @route   POST /api/auth/sso
// @access  Public
exports.ssoLogin = asyncHandler(async (req, res) => {
  const { samlResponse, ldapCredentials } = req.body;

  // LDAP authentication
  if (ldapCredentials) {
    const { username, password, tenantId } = ldapCredentials;

    // Find tenant's LDAP config
    const config = await LDAPConfig.findOne({ tenantId, enabled: true, ssoEnabled: true });

    if (!config) {
      return res.status(400).json({
        success: false,
        message: 'LDAP SSO is not enabled for this tenant',
      });
    }

    const ldapService = new LDAPService(config);

    try {
      await ldapService.connect();
      const ldapUser = await ldapService.authenticate(username, password);
      ldapService.disconnect();

      // Get user groups and map to role
      const groups = await ldapService.getUserGroups(username);
      const systemRole = ldapService.mapGroupToRole(groups, config.roleMappings);

      // Find or create user
      let user = await User.findOne({
        tenantId,
        $or: [{ email: ldapUser.email }, { username: ldapUser.username }],
      });

      if (!user) {
        user = await User.create({
          tenantId,
          email: ldapUser.email,
          username: ldapUser.username,
          name: ldapUser.name,
          role: systemRole,
          status: 'Active',
          password: crypto.randomBytes(32).toString('hex'),
          passwordChangeRequired: false,
        });
      } else {
        // Update user info
        user.name = ldapUser.name;
        user.role = systemRole;
        await user.save();
      }

      // Generate token
      const generateToken = require('../utils/generateToken');
      const token = generateToken(user._id);

      await createAuditLog({
        tenantId,
        userId: user._id,
        action: 'SSO Login (LDAP)',
        module: 'Authentication',
        entityType: 'User',
        description: 'User logged in via LDAP SSO',
      });

      res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'LDAP authentication failed',
        error: error.message,
      });
    }
  } else {
    // SAML authentication (placeholder - implement SAML library like passport-saml)
    return res.status(400).json({
      success: false,
      message: 'SAML authentication not yet implemented',
    });
  }
});

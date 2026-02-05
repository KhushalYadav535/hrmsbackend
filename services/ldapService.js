/**
 * LDAP/Active Directory Service
 * BRD Requirement: BR-UAM-007
 * Handles LDAP authentication, user sync, and role mapping
 */

const ldap = require('ldapjs');
const crypto = require('crypto');

class LDAPService {
  constructor(config) {
    this.config = config;
    this.client = null;
  }

  /**
   * Connect to LDAP server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const url = this.config.sslEnabled 
          ? `ldaps://${this.config.serverUrl}`
          : `ldap://${this.config.serverUrl}`;

        this.client = ldap.createClient({
          url: url,
          tlsOptions: this.config.sslEnabled ? {
            rejectUnauthorized: false, // In production, use proper certificates
          } : undefined,
        });

        this.client.on('error', (err) => {
          console.error('LDAP connection error:', err);
          reject(err);
        });

        this.client.bind(this.config.bindDN, this.config.bindPassword, (err) => {
          if (err) {
            console.error('LDAP bind error:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Search for users in LDAP
   */
  async searchUsers(searchFilter = '(objectClass=person)', attributes = ['*']) {
    return new Promise((resolve, reject) => {
      const searchBase = this.config.userSearchBase || this.config.baseDN;
      const opts = {
        filter: searchFilter,
        scope: 'sub',
        attributes: attributes,
      };

      const results = [];

      this.client.search(searchBase, opts, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        res.on('searchEntry', (entry) => {
          results.push(entry.object);
        });

        res.on('error', (err) => {
          reject(err);
        });

        res.on('end', (result) => {
          if (result.status !== 0) {
            reject(new Error(`LDAP search ended with status: ${result.status}`));
          } else {
            resolve(results);
          }
        });
      });
    });
  }

  /**
   * Authenticate user against LDAP
   */
  async authenticate(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        // First, search for the user
        const searchFilter = `(sAMAccountName=${username})`; // Active Directory
        const users = await this.searchUsers(searchFilter, ['dn', 'sAMAccountName', 'mail', 'displayName', 'memberOf']);

        if (users.length === 0) {
          reject(new Error('User not found in LDAP'));
          return;
        }

        const userDN = users[0].dn;

        // Try to bind with user's credentials
        const userClient = ldap.createClient({
          url: this.config.sslEnabled 
            ? `ldaps://${this.config.serverUrl}`
            : `ldap://${this.config.serverUrl}`,
        });

        userClient.bind(userDN, password, (err) => {
          if (err) {
            reject(new Error('Invalid credentials'));
          } else {
            resolve({
              dn: userDN,
              username: users[0].sAMAccountName || username,
              email: users[0].mail || users[0].mail || '',
              name: users[0].displayName || users[0].cn || username,
              groups: users[0].memberOf || [],
            });
          }
          userClient.unbind();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get user groups from LDAP
   */
  async getUserGroups(username) {
    try {
      const searchFilter = `(sAMAccountName=${username})`;
      const users = await this.searchUsers(searchFilter, ['memberOf']);

      if (users.length === 0) {
        return [];
      }

      return users[0].memberOf || [];
    } catch (error) {
      console.error('Error getting user groups:', error);
      return [];
    }
  }

  /**
   * Map LDAP group to system role
   */
  mapGroupToRole(ldapGroups, roleMappings) {
    for (const mapping of roleMappings) {
      // Check if user is in this LDAP group
      const groupDN = mapping.ldapGroup.toLowerCase();
      const userInGroup = ldapGroups.some(group => 
        group.toLowerCase().includes(groupDN) || 
        group.toLowerCase().endsWith(groupDN)
      );

      if (userInGroup) {
        return mapping.systemRole;
      }
    }

    // Default role if no mapping found
    return 'Employee';
  }

  /**
   * Disconnect from LDAP
   */
  disconnect() {
    if (this.client) {
      this.client.unbind();
      this.client = null;
    }
  }
}

module.exports = LDAPService;

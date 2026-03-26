/**
 * Multi-role helpers: User may have `roles[]` plus legacy `role` string.
 * All authorization should use userHasRole / userHasAnyRole.
 */

const ROLE_ENUM = [
  'Super Admin',
  'Tenant Admin',
  'HR Administrator',
  'Payroll Administrator',
  'Finance Administrator',
  'Manager',
  'Employee',
  'Auditor',
];

/** Lower index in ROLE_ENUM = higher privilege (used for legacy single `role` / display). */
const ROLE_RANK = ROLE_ENUM.reduce((acc, r, i) => {
  acc[r] = i;
  return acc;
}, {});

function normalizeRoles(user) {
  if (!user) return [];
  const fromArr =
    user.roles && Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles.filter((r) => r && ROLE_ENUM.includes(r))
      : [];
  const fromLegacy =
    user.role && ROLE_ENUM.includes(user.role) ? [user.role] : [];
  const merged = [...new Set([...fromArr, ...fromLegacy])];
  return merged;
}

function userHasRole(user, role) {
  return normalizeRoles(user).includes(role);
}

function userHasAnyRole(user, roles) {
  if (!roles || !roles.length) return false;
  const u = normalizeRoles(user);
  return roles.some((r) => u.includes(r));
}

function primaryRole(user) {
  const rs = normalizeRoles(user);
  if (!rs.length) return user && user.role ? user.role : 'Employee';
  return rs.reduce((best, r) => (ROLE_RANK[r] < ROLE_RANK[best] ? r : best), rs[0]);
}

/**
 * Keep legacy `role` aligned for indexes and old code paths that read .role once.
 */
function syncRoleFields(userDoc) {
  if (!userDoc) return;
  const rs = normalizeRoles(userDoc);
  if (!rs.length) return;
  const primary = primaryRole(userDoc);
  if (userDoc.role !== primary) {
    userDoc.role = primary;
  }
  if (!userDoc.roles || !userDoc.roles.length) {
    userDoc.roles = rs;
  }
}

/** Roles that must not be forced into "employee self only" API scope when combined with Employee */
const ELEVATED_SCOPE_ROLES = [
  'Super Admin',
  'Tenant Admin',
  'HR Administrator',
  'Payroll Administrator',
  'Finance Administrator',
  'Manager',
  'Auditor',
];

/** Employee + Manager (etc.) should use elevated route logic, not employee-only filtering */
function useNarrowEmployeeScope(user) {
  return userHasRole(user, 'Employee') && !userHasAnyRole(user, ELEVATED_SCOPE_ROLES);
}

module.exports = {
  ROLE_ENUM,
  ROLE_RANK,
  normalizeRoles,
  userHasRole,
  userHasAnyRole,
  primaryRole,
  syncRoleFields,
  ELEVATED_SCOPE_ROLES,
  useNarrowEmployeeScope,
};

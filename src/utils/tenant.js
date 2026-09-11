/**
 * Tenant (college / year / department) resolution.
 *
 * All fields are read directly from Firestore canonical user documents.
 * Supports graceful fallback to 'global' if institutional tenant is disabled or missing.
 */

const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());

/**
 * @param {object} user - Canonical user document from Firestore users/{uid}
 * @returns {{tenantId:string, college:string, year:string, cohortId:string, department:string, email:string, valid:boolean, isGlobalFallback:boolean, missing:string[]}}
 */
export function resolveTenant(user = {}) {
  let tenantId     = norm(user.tenantId);
  const college    = norm(user.college) || 'Global Campus';
  const year       = norm(user.year) || 'ALL';
  const cohortId   = norm(user.cohortId) || 'ALL';
  const department = norm(user.department) || 'UNSPECIFIED';
  const email      = norm(user.email).toLowerCase();

  // If user has no tenant or their institution is paused/disabled, fallback gracefully to 'global'
  const isGlobalFallback = !tenantId || user.isTenantDisabled === true || user.tenantActive === false;
  if (isGlobalFallback) {
    tenantId = 'global';
  }

  const missing = [];
  if (!email) missing.push('email');

  return {
    tenantId,
    college: isGlobalFallback ? 'Global Campus' : college,
    year,
    cohortId,
    department,
    email,
    valid: missing.length === 0,
    isGlobalFallback,
    missing,
  };
}

/** Same as resolveTenant but throws when the identity is missing required fields (like email). */
export function requireTenant(userData = {}) {
  const tenant = resolveTenant(userData);
  if (!tenant.valid) {
    throw new Error(
      `TENANT_INCOMPLETE: missing ${tenant.missing.join(', ')} on the signed-in profile.`
    );
  }
  return tenant;
}

/** Department is optional for canonical paths; fall back only within the same tenant. */
export function tenantDepartment(tenant) {
  return tenant.department || 'UNSPECIFIED';
}

export default resolveTenant;

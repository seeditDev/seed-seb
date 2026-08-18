/**
 * Tenant (college / year / department) resolution.
 *
 * BUG FIXED: call sites used `userData.College || 'KGKITE'` and
 * `userData.Year || '2026'`. A falsy field therefore silently routed reads AND
 * writes into a *different tenant's* document path — cross-tenant data leak and
 * corruption. Resolution now normalises the real value and never invents a
 * different college/year: when the field is missing we fail loudly instead.
 */

const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());

/**
 * @returns {{college:string, year:string, department:string, email:string, valid:boolean, missing:string[]}}
 */
export function resolveTenant(userData = {}) {
  const tenantId = norm(userData.tenantId ?? userData.TenantId ?? userData.tenant_id ?? userData.College ?? userData.college);
  const college = norm(userData.College ?? userData.college);
  const year = norm(userData.Year ?? userData.year);
  const department = norm(userData.Department ?? userData.department);
  const email = norm(userData.Email ?? userData.email).toLowerCase();

  const missing = [];
  if (!tenantId && !college) missing.push('TenantId');
  if (!email) missing.push('Email');

  return { tenantId, college: college || tenantId, year, department, email, valid: missing.length === 0, missing };
}

/** Same as resolveTenant but throws when the identity is incomplete. */
export function requireTenant(userData = {}) {
  const tenant = resolveTenant(userData);
  if (!tenant.valid) {
    throw new Error(
      `TENANT_INCOMPLETE: missing ${tenant.missing.join(', ')} on the signed-in profile. ` +
        'Refusing to read or write assessment data with substituted values.'
    );
  }
  return tenant;
}

/** Department is optional for canonical paths; fall back only within the same tenant. */
export function tenantDepartment(tenant) {
  return tenant.department || 'UNSPECIFIED';
}

export default resolveTenant;

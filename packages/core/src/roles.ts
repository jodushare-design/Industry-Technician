/**
 * Roles and permissions shared by web, admin and mobile.
 *
 * The database (RLS + Postgres functions) is the source of truth for access.
 * This module mirrors those rules so the UI can hide actions a user cannot
 * take. It must never be the only check.
 *
 * Business-model rule: no role other than `customer` may approve an estimate
 * or a part cost — not even platform admins. See docs/platform-responsibility-model.md §4.
 */

export const ROLES = [
  'customer',
  'technician',
  'company_admin',
  'company_technician',
  'support_agent',
  'platform_admin',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that belong to an organization (a service company). */
export const ORG_SCOPED_ROLES = ['company_admin', 'company_technician'] as const satisfies readonly Role[];

/** Roles that work for the platform itself (admin portal). */
export const STAFF_ROLES = ['support_agent', 'platform_admin'] as const satisfies readonly Role[];

/** Roles that provide services (independent providers and company staff). */
export const PROVIDER_ROLES = ['technician', 'company_admin', 'company_technician'] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  customer: 'Customer',
  technician: 'Independent service provider',
  company_admin: 'Service company administrator',
  company_technician: 'Service company technician',
  support_agent: 'Platform support',
  platform_admin: 'Platform administrator',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((r) => (STAFF_ROLES as readonly Role[]).includes(r));
}

export function isProvider(roles: readonly Role[]): boolean {
  return roles.some((r) => (PROVIDER_ROLES as readonly Role[]).includes(r));
}

/**
 * Actions the product exposes. Names are stable identifiers used by UI guards
 * and tests; later phases add to this list.
 */
export const ACTIONS = [
  'service_request.create',
  'service_request.invite_provider',
  'service_request.suggest_provider',
  'job.assign_employee',
  'estimate.draft',
  'estimate.send',
  'estimate.decide', // accept / reject / request revision
  'part.decide',
  'job.update_provider_status',
  'job.confirm_completion',
  'complaint.create',
  'complaint.manage',
  'verification.set',
  'account.suspend',
  'catalogue.manage',
  'legal_document.manage',
  'audit_log.read',
] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Action, readonly Role[]> = {
  'service_request.create': ['customer'],
  'service_request.invite_provider': ['customer'],
  'service_request.suggest_provider': ['support_agent', 'platform_admin'],
  'job.assign_employee': ['company_admin'],
  'estimate.draft': ['technician', 'company_admin', 'company_technician'],
  // company_technician may send only when their company grants it; that grant is checked per-organization in the DB.
  'estimate.send': ['technician', 'company_admin'],
  'estimate.decide': ['customer'],
  'part.decide': ['customer'],
  'job.update_provider_status': ['technician', 'company_admin', 'company_technician'],
  'job.confirm_completion': ['customer'],
  'complaint.create': ['customer', 'technician', 'company_admin', 'company_technician', 'support_agent'],
  'complaint.manage': ['support_agent', 'platform_admin'],
  'verification.set': ['platform_admin'],
  'account.suspend': ['platform_admin'],
  'catalogue.manage': ['platform_admin'],
  'legal_document.manage': ['platform_admin'],
  'audit_log.read': ['platform_admin'],
};

/** Coarse role check. Ownership (e.g. "own job") is enforced by the database. */
export function can(roles: readonly Role[], action: Action): boolean {
  const allowed = MATRIX[action];
  return roles.some((r) => allowed.includes(r));
}

export function rolesAllowed(action: Action): readonly Role[] {
  return MATRIX[action];
}

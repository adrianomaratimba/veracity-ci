import { z } from "zod";
import { userRoleEnum } from "./schema";

export type UserRole = z.infer<typeof userRoleEnum>;

// ================================================================
// PERMISSION TYPES - Granular permissions for RBAC
// ================================================================
export type Permission = 
  // Organization permissions
  | "org:view"
  | "org:edit"
  | "org:delete"
  | "org:manage_billing"      // Only owner
  | "org:manage_branding"
  | "org:manage_domains"
  // Member management
  | "members:view"
  | "members:view_team"       // Can see team page
  | "members:invite"
  | "members:edit_role"
  | "members:remove"
  | "members:add_admin"       // Only owner can add admins
  // Survey management
  | "surveys:view"
  | "surveys:view_assigned"   // Interviewers only see assigned
  | "surveys:create"
  | "surveys:edit"
  | "surveys:delete"
  | "surveys:publish"
  | "surveys:assign_interviewers"
  // Response/Interview management
  | "responses:view"          // View all responses
  | "responses:view_own"      // Only own responses
  | "responses:submit"        // Can submit interviews
  | "responses:audit"         // Can audit/review responses
  | "responses:invalidate"    // Can invalidate responses
  // Analytics
  | "analytics:view"          // Full analytics access
  | "analytics:view_aggregate" // Only aggregated data (no individual)
  | "analytics:export"
  // Sensitive data
  | "audio:listen"
  | "gps:view"
  | "audit_logs:view"
  // Settings
  | "settings:view"
  | "settings:edit";

// ================================================================
// ROLE PERMISSIONS MATRIX - STRICT SECURITY
// ================================================================
// CRITICAL: This matrix defines exactly what each role can do
// DO NOT modify without security review
// ================================================================
const rolePermissions: Record<UserRole, Permission[]> = {
  // ------------------------------------------------
  // PROPRIETÁRIO (Owner) - Full access
  // ------------------------------------------------
  owner: [
    // Organization
    "org:view", "org:edit", "org:delete", "org:manage_billing", "org:manage_branding", "org:manage_domains",
    // Members - ONLY owner can add admins
    "members:view", "members:view_team", "members:invite", "members:edit_role", "members:remove", "members:add_admin",
    // Surveys
    "surveys:view", "surveys:create", "surveys:edit", "surveys:delete", "surveys:publish", "surveys:assign_interviewers",
    // Responses
    "responses:view", "responses:submit", "responses:audit", "responses:invalidate",
    // Analytics
    "analytics:view", "analytics:view_aggregate", "analytics:export",
    // Sensitive data
    "audio:listen", "gps:view", "audit_logs:view",
    // Settings
    "settings:view", "settings:edit"
  ],
  
  // ------------------------------------------------
  // ADMINISTRADOR - Almost full access, but NO billing or adding admins
  // ------------------------------------------------
  admin: [
    // Organization - NO billing management
    "org:view", "org:edit", "org:manage_branding", "org:manage_domains",
    // Members - CANNOT add admins or edit owner
    "members:view", "members:view_team", "members:invite", "members:edit_role", "members:remove",
    // Surveys
    "surveys:view", "surveys:create", "surveys:edit", "surveys:delete", "surveys:publish", "surveys:assign_interviewers",
    // Responses
    "responses:view", "responses:submit", "responses:audit", "responses:invalidate",
    // Analytics
    "analytics:view", "analytics:view_aggregate", "analytics:export",
    // Sensitive data
    "audio:listen", "gps:view", "audit_logs:view",
    // Settings
    "settings:view", "settings:edit"
  ],
  
  // ------------------------------------------------
  // COORDENADOR - View & monitor only, NO create/edit/delete
  // ------------------------------------------------
  coordinator: [
    // Organization - view only
    "org:view",
    // Members - NO access to team management
    // Surveys - view only, can assign interviewers
    "surveys:view", "surveys:assign_interviewers",
    // Responses - view only, NO audit/invalidate
    "responses:view",
    // Analytics - view aggregated and detailed
    "analytics:view", "analytics:view_aggregate",
    // Sensitive data - can view GPS and maps for monitoring
    "gps:view"
    // NO audio:listen - privacy concern
    // NO audit_logs:view
    // NO settings access
  ],
  
  // ------------------------------------------------
  // ENTREVISTADOR - Collect data only
  // ------------------------------------------------
  interviewer: [
    // Organization - view only
    "org:view",
    // Surveys - ONLY assigned surveys
    "surveys:view_assigned",
    // Responses - submit and view own only
    "responses:view_own", "responses:submit"
    // NO analytics
    // NO audio/gps view (only capture)
    // NO team access
    // NO settings
  ],
  
  // ------------------------------------------------
  // VISUALIZADOR (Client) - Read-only dashboards
  // ------------------------------------------------
  viewer: [
    // Organization - view only
    "org:view",
    // Surveys - view active/completed
    "surveys:view",
    // Analytics - aggregated only (no individual responses)
    "analytics:view_aggregate"
    // NO responses:view (individual)
    // NO audio/gps
    // NO team
    // NO settings
  ]
};

// ================================================================
// PERMISSION CHECK FUNCTIONS
// ================================================================

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function getPermissions(role: UserRole): Permission[] {
  return rolePermissions[role] ?? [];
}

// ================================================================
// ROLE HIERARCHY - For determining who can manage whom
// ================================================================
const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 100,
  admin: 80,
  coordinator: 60,
  interviewer: 40,
  viewer: 20
};

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

export function isHigherRole(role1: UserRole, role2: UserRole): boolean {
  return getRoleLevel(role1) > getRoleLevel(role2);
}

// ================================================================
// ROLE MANAGEMENT - Who can add/edit which roles
// ================================================================

/**
 * Get roles that a caller can manage (invite, edit, remove)
 * CRITICAL: 
 * - Owner can manage ALL roles including admin
 * - Admin can manage coordinator, interviewer, viewer (NOT admin, NOT owner)
 * - Others cannot manage anyone
 */
export function getManageableRoles(callerRole: UserRole): UserRole[] {
  switch (callerRole) {
    case 'owner':
      return ['admin', 'coordinator', 'interviewer', 'viewer'];
    case 'admin':
      // Admin CANNOT add other admins - this is CRITICAL security
      return ['coordinator', 'interviewer', 'viewer'];
    default:
      return [];
  }
}

/**
 * Get roles that can be invited by a caller
 * Same as manageable roles
 */
export function getInviteableRoles(callerRole: UserRole): UserRole[] {
  return getManageableRoles(callerRole);
}

/**
 * Check if caller can manage (edit/remove) a target role
 */
export function canManageRole(callerRole: UserRole, targetRole: UserRole): boolean {
  // Nobody can manage owner
  if (targetRole === 'owner') return false;
  // Only owner can manage admin
  if (targetRole === 'admin' && callerRole !== 'owner') return false;
  return getManageableRoles(callerRole).includes(targetRole);
}

/**
 * Check if caller can change a user's role to a new role
 */
export function canChangeToRole(callerRole: UserRole, currentRole: UserRole, newRole: UserRole): boolean {
  // Must be able to manage both current and new role
  return canManageRole(callerRole, currentRole) && canManageRole(callerRole, newRole);
}

// ================================================================
// CONVENIENCE FUNCTIONS - For common permission checks
// ================================================================

// Survey permissions
export function canManageSurveys(role: UserRole): boolean {
  return hasPermission(role, "surveys:create") || hasPermission(role, "surveys:edit");
}

export function canCreateSurveys(role: UserRole): boolean {
  return hasPermission(role, "surveys:create");
}

export function canEditSurveys(role: UserRole): boolean {
  return hasPermission(role, "surveys:edit");
}

export function canDeleteSurveys(role: UserRole): boolean {
  return hasPermission(role, "surveys:delete");
}

export function canAssignInterviewers(role: UserRole): boolean {
  return hasPermission(role, "surveys:assign_interviewers");
}

// Member permissions
export function canManageMembers(role: UserRole): boolean {
  return hasPermission(role, "members:invite");
}

export function canViewTeam(role: UserRole): boolean {
  return hasPermission(role, "members:view_team");
}

export function canInviteMembers(role: UserRole): boolean {
  return hasPermission(role, "members:invite");
}

export function canEditRoles(role: UserRole): boolean {
  return hasPermission(role, "members:edit_role");
}

export function canAddAdmins(role: UserRole): boolean {
  return hasPermission(role, "members:add_admin");
}

// Analytics permissions
export function canViewAnalytics(role: UserRole): boolean {
  return hasPermission(role, "analytics:view");
}

export function canViewFullAnalytics(role: UserRole): boolean {
  return hasPermission(role, "analytics:view");
}

export function canViewAggregateAnalytics(role: UserRole): boolean {
  return hasPermission(role, "analytics:view_aggregate");
}

// Response permissions
export function canViewResponses(role: UserRole): boolean {
  return hasPermission(role, "responses:view");
}

export function canViewOwnResponses(role: UserRole): boolean {
  return hasPermission(role, "responses:view_own");
}

export function canAuditResponses(role: UserRole): boolean {
  return hasPermission(role, "responses:audit");
}

export function canInvalidateResponses(role: UserRole): boolean {
  return hasPermission(role, "responses:invalidate");
}

// Sensitive data permissions
export function canListenAudio(role: UserRole): boolean {
  return hasPermission(role, "audio:listen");
}

export function canViewGPS(role: UserRole): boolean {
  return hasPermission(role, "gps:view");
}

export function canViewAuditLogs(role: UserRole): boolean {
  return hasPermission(role, "audit_logs:view");
}

// Settings permissions
export function canViewSettings(role: UserRole): boolean {
  return hasPermission(role, "settings:view");
}

export function canEditSettings(role: UserRole): boolean {
  return hasPermission(role, "settings:edit");
}

// Role checks
export function isInterviewerRole(role: UserRole): boolean {
  return role === 'interviewer';
}

export function isViewerRole(role: UserRole): boolean {
  return role === 'viewer';
}

export function isOwnerRole(role: UserRole): boolean {
  return role === 'owner';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}

export function isCoordinatorRole(role: UserRole): boolean {
  return role === 'coordinator';
}

export function isAdminOrOwner(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}

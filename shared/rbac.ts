import { z } from "zod";
import { userRoleEnum } from "./schema";

export type UserRole = z.infer<typeof userRoleEnum>;

export type Permission = 
  | "org:view"
  | "org:edit"
  | "org:delete"
  | "org:manage_billing"
  | "org:manage_branding"
  | "members:view"
  | "members:invite"
  | "members:edit_role"
  | "members:remove"
  | "surveys:view"
  | "surveys:view_assigned"
  | "surveys:create"
  | "surveys:edit"
  | "surveys:delete"
  | "surveys:publish"
  | "responses:view"
  | "responses:view_own"
  | "responses:submit"
  | "responses:audit"
  | "responses:invalidate"
  | "analytics:view"
  | "analytics:view_aggregate"
  | "audio:listen"
  | "gps:view"
  | "audit_logs:view";

const rolePermissions: Record<UserRole, Permission[]> = {
  owner: [
    "org:view", "org:edit", "org:delete", "org:manage_billing", "org:manage_branding",
    "members:view", "members:invite", "members:edit_role", "members:remove",
    "surveys:view", "surveys:create", "surveys:edit", "surveys:delete", "surveys:publish",
    "responses:view", "responses:submit", "responses:audit", "responses:invalidate",
    "analytics:view", "analytics:view_aggregate",
    "audio:listen", "gps:view", "audit_logs:view"
  ],
  admin: [
    "org:view", "org:edit", "org:manage_branding",
    "members:view", "members:invite", "members:edit_role", "members:remove",
    "surveys:view", "surveys:create", "surveys:edit", "surveys:delete", "surveys:publish",
    "responses:view", "responses:submit", "responses:audit", "responses:invalidate",
    "analytics:view", "analytics:view_aggregate",
    "audio:listen", "gps:view", "audit_logs:view"
  ],
  coordinator: [
    "org:view",
    "members:view",
    "surveys:view",
    "responses:view", "responses:audit",
    "analytics:view", "analytics:view_aggregate",
    "audio:listen", "gps:view"
  ],
  interviewer: [
    "org:view",
    "surveys:view_assigned",
    "responses:view_own", "responses:submit"
  ],
  viewer: [
    "org:view",
    "surveys:view",
    "analytics:view_aggregate"
  ]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function getPermissions(role: UserRole): Permission[] {
  return rolePermissions[role] ?? [];
}

export function canManageSurveys(role: UserRole): boolean {
  return hasPermission(role, "surveys:create") || hasPermission(role, "surveys:edit");
}

export function canManageMembers(role: UserRole): boolean {
  return hasPermission(role, "members:invite") || hasPermission(role, "members:edit_role");
}

export function canViewAnalytics(role: UserRole): boolean {
  return hasPermission(role, "analytics:view");
}

export function canViewFullAnalytics(role: UserRole): boolean {
  return hasPermission(role, "analytics:view");
}

export function canViewAggregateAnalytics(role: UserRole): boolean {
  return hasPermission(role, "analytics:view_aggregate");
}

export function canViewResponses(role: UserRole): boolean {
  return hasPermission(role, "responses:view");
}

export function canAuditResponses(role: UserRole): boolean {
  return hasPermission(role, "responses:audit");
}

export function canListenAudio(role: UserRole): boolean {
  return hasPermission(role, "audio:listen");
}

export function canViewGPS(role: UserRole): boolean {
  return hasPermission(role, "gps:view");
}

export function canViewAuditLogs(role: UserRole): boolean {
  return hasPermission(role, "audit_logs:view");
}

export function isInterviewerRole(role: UserRole): boolean {
  return role === 'interviewer';
}

export function getManageableRoles(role: UserRole): UserRole[] {
  switch (role) {
    case 'owner':
      return ['admin', 'coordinator', 'interviewer', 'viewer'];
    case 'admin':
      return ['coordinator', 'interviewer', 'viewer'];
    default:
      return [];
  }
}

export function canManageRole(callerRole: UserRole, targetRole: UserRole): boolean {
  return getManageableRoles(callerRole).includes(targetRole);
}

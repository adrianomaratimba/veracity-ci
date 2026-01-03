import { z } from "zod";
import { userRoleEnum } from "./schema";

export type UserRole = z.infer<typeof userRoleEnum>;

export type Permission = 
  | "org:view"
  | "org:edit"
  | "org:delete"
  | "org:manage_billing"
  | "members:view"
  | "members:invite"
  | "members:edit_role"
  | "members:remove"
  | "surveys:view"
  | "surveys:create"
  | "surveys:edit"
  | "surveys:delete"
  | "surveys:publish"
  | "responses:view"
  | "responses:submit"
  | "responses:audit"
  | "analytics:view";

const rolePermissions: Record<UserRole, Permission[]> = {
  owner: [
    "org:view", "org:edit", "org:delete", "org:manage_billing",
    "members:view", "members:invite", "members:edit_role", "members:remove",
    "surveys:view", "surveys:create", "surveys:edit", "surveys:delete", "surveys:publish",
    "responses:view", "responses:submit", "responses:audit",
    "analytics:view"
  ],
  admin: [
    "org:view", "org:edit",
    "members:view", "members:invite", "members:edit_role", "members:remove",
    "surveys:view", "surveys:create", "surveys:edit", "surveys:delete", "surveys:publish",
    "responses:view", "responses:submit", "responses:audit",
    "analytics:view"
  ],
  coordinator: [
    "org:view",
    "members:view",
    "surveys:view", "surveys:create", "surveys:edit", "surveys:publish",
    "responses:view", "responses:audit",
    "analytics:view"
  ],
  interviewer: [
    "org:view",
    "surveys:view",
    "responses:view", "responses:submit"
  ],
  viewer: [
    "org:view",
    "surveys:view",
    "responses:view",
    "analytics:view"
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

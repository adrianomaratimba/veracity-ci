import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { getResolvedUserId } from "../replit_integrations/auth";
import { 
  hasPermission, 
  Permission, 
  UserRole, 
  canManageRole,
  isAdminOrOwner,
  canAddAdmins
} from "@shared/rbac";

declare global {
  namespace Express {
    interface Request {
      orgMember?: {
        organizationId: number;
        userId: string;
        role: UserRole;
      };
    }
  }
}

// ================================================================
// SECURITY AUDIT LOGGING
// ================================================================
function logSecurityEvent(event: {
  type: 'access_denied' | 'permission_denied' | 'role_violation' | 'audit';
  userId?: string;
  orgId?: number;
  role?: string;
  action?: string;
  targetRole?: string;
  ip?: string;
}) {
  console.log(`[SECURITY] ${event.type.toUpperCase()}:`, JSON.stringify(event));
}

// ================================================================
// CORE MIDDLEWARE - Organization Access with Permission Check
// ================================================================
export function requireOrgAccess(
  orgIdParam: string = "orgId",
  requiredPermission?: Permission
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await getResolvedUserId(req);
      if (!userId) {
        logSecurityEvent({ type: 'access_denied', action: 'no_user_id', ip: req.ip });
        return res.status(401).json({ message: "Não autenticado" });
      }

      const orgId = Number(req.params[orgIdParam] || req.params.id);
      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ message: "ID da organização inválido" });
      }

      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) {
        logSecurityEvent({ 
          type: 'access_denied', 
          userId, 
          orgId, 
          action: 'not_member',
          ip: req.ip 
        });
        return res.status(403).json({ message: "Você não é membro desta organização" });
      }

      const role = member.role as UserRole;

      if (requiredPermission && !hasPermission(role, requiredPermission)) {
        logSecurityEvent({ 
          type: 'permission_denied', 
          userId, 
          orgId, 
          role,
          action: requiredPermission,
          ip: req.ip 
        });
        return res.status(403).json({ 
          message: "Você não tem permissão para realizar esta ação" 
        });
      }

      req.orgMember = {
        organizationId: orgId,
        userId,
        role
      };

      next();
    } catch (error) {
      console.error("Error in org access middleware:", error);
      res.status(500).json({ message: "Erro interno ao verificar acesso" });
    }
  };
}

// ================================================================
// PERMISSION MIDDLEWARE - Check specific permission after org access
// ================================================================
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.orgMember) {
      return res.status(401).json({ message: "Contexto de organização não encontrado" });
    }

    if (!hasPermission(req.orgMember.role, permission)) {
      logSecurityEvent({ 
        type: 'permission_denied', 
        userId: req.orgMember.userId, 
        orgId: req.orgMember.organizationId, 
        role: req.orgMember.role,
        action: permission,
        ip: req.ip 
      });
      return res.status(403).json({ 
        message: "Você não tem permissão para realizar esta ação" 
      });
    }

    next();
  };
}

// ================================================================
// ROLE-BASED MIDDLEWARE - Require specific roles
// ================================================================
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.orgMember) {
      return res.status(401).json({ message: "Contexto de organização não encontrado" });
    }

    if (!allowedRoles.includes(req.orgMember.role)) {
      logSecurityEvent({ 
        type: 'role_violation', 
        userId: req.orgMember.userId, 
        orgId: req.orgMember.organizationId, 
        role: req.orgMember.role,
        action: `requires: ${allowedRoles.join(', ')}`,
        ip: req.ip 
      });
      return res.status(403).json({ 
        message: "Sua função não permite realizar esta ação" 
      });
    }

    next();
  };
}

// ================================================================
// OWNER ONLY MIDDLEWARE - For sensitive operations
// ================================================================
export function requireOwner() {
  return requireRole('owner');
}

// ================================================================
// ADMIN OR OWNER MIDDLEWARE - For management operations
// ================================================================
export function requireAdminOrOwner() {
  return requireRole('owner', 'admin');
}

// ================================================================
// CAN MANAGE ROLE MIDDLEWARE - For role change operations
// ================================================================
export function requireCanManageRole(targetRoleGetter: (req: Request) => UserRole | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.orgMember) {
      return res.status(401).json({ message: "Contexto de organização não encontrado" });
    }

    const targetRole = targetRoleGetter(req);
    if (!targetRole) {
      return res.status(400).json({ message: "Função alvo não especificada" });
    }

    // Special check: only owner can add/manage admins
    if (targetRole === 'admin' && !canAddAdmins(req.orgMember.role)) {
      logSecurityEvent({ 
        type: 'role_violation', 
        userId: req.orgMember.userId, 
        orgId: req.orgMember.organizationId, 
        role: req.orgMember.role,
        targetRole,
        action: 'add_admin_attempt',
        ip: req.ip 
      });
      return res.status(403).json({ 
        message: "Somente o proprietário pode adicionar ou gerenciar administradores" 
      });
    }

    if (!canManageRole(req.orgMember.role, targetRole)) {
      logSecurityEvent({ 
        type: 'role_violation', 
        userId: req.orgMember.userId, 
        orgId: req.orgMember.organizationId, 
        role: req.orgMember.role,
        targetRole,
        action: 'manage_role_attempt',
        ip: req.ip 
      });
      return res.status(403).json({ 
        message: "Você não tem permissão para gerenciar esta função" 
      });
    }

    next();
  };
}

// ================================================================
// ORGANIZATION MEMBERSHIP CHECK
// ================================================================
export async function requireHasOrganization(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await getResolvedUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Não autenticado" });
    }

    const orgs = await storage.getOrganizationsByUserId(userId);
    if (!orgs || orgs.length === 0) {
      return res.status(403).json({ 
        message: "Você precisa ser adicionado a uma organização para acessar esta funcionalidade",
        code: "NO_ORGANIZATION"
      });
    }

    next();
  } catch (error) {
    console.error("Error checking user organizations:", error);
    res.status(500).json({ message: "Erro interno" });
  }
}

// Export security logging for use in routes
export { logSecurityEvent };

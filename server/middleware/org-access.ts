import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { getUserId } from "../replit_integrations/auth";
import { hasPermission, Permission, UserRole } from "@shared/rbac";

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

export function requireOrgAccess(
  orgIdParam: string = "orgId",
  requiredPermission?: Permission
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const orgId = Number(req.params[orgIdParam] || req.params.id);
      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ message: "ID da organização inválido" });
      }

      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) {
        return res.status(403).json({ message: "Você não é membro desta organização" });
      }

      const role = member.role as UserRole;

      if (requiredPermission && !hasPermission(role, requiredPermission)) {
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

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.orgMember) {
      return res.status(401).json({ message: "Contexto de organização não encontrado" });
    }

    if (!hasPermission(req.orgMember.role, permission)) {
      return res.status(403).json({ 
        message: "Você não tem permissão para realizar esta ação" 
      });
    }

    next();
  };
}

export async function requireHasOrganization(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
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

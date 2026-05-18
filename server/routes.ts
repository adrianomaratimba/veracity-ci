import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, registerAuthRoutes, isAuthenticated, getUserId, getResolvedUserId } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { requireOrgAccess, requireHasOrganization } from "./middleware/org-access";
import { hasPermission, UserRole, canManageRole, getManageableRoles, isInterviewerRole, canManageSurveys, canViewResponses, canViewAnalytics, canAuditResponses } from "@shared/rbac";
import { z } from "zod";
import { randomBytes } from "crypto";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon as turfPolygon } from "@turf/helpers";

function isCoordInsidePolygon(lng: number, lat: number, coordinates: [number, number][]): boolean {
  try {
    if (!coordinates || coordinates.length < 3) return false;
    const poly = turfPolygon([coordinates]);
    return booleanPointInPolygon(point([lng, lat]), poly);
  } catch {
    return false;
  }
}
import { db } from "./db";
import { users, sanitizeUser, sanitizeMemberUser } from "@shared/models/auth";
import { sql, eq, desc } from "drizzle-orm";
import { authService } from "./auth-service";
import { 
  organizationMembers, 
  pendingInvitations, 
  surveyAssignments, 
  surveyCoordinators,
  surveyViewers, 
  responses, 
  surveys,
  interviewerLocations,
  dailyDistanceSummary,
  insertInterviewerLocationSchema,
  geofenceViolations
} from "@shared/schema";
import webpush from "web-push";
import { sendWhatsAppMessage } from "./twilio-client";

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:noreply@dataveracity.com.br',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}
import { 
  calculateHaversineDistance, 
  updateDailyDistanceSummary, 
  getTotalSurveyDistance,
  getRouteForDay,
  formatDistance
} from "./services/distance-calculator";
import { verificationTokens } from "@shared/models/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // 1. Setup Auth & Object Storage integrations
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

  // 2. Organizations - SECURED: Only show orgs where user is a member
  app.get(api.organizations.list.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const orgs = await storage.getOrganizationsByUserId(userId);
    res.json(orgs);
  });

  app.get("/api/organizations/:id", isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const orgId = Number(req.params.id);
    
    // Security check: User must be member of the organization
    const isMember = await storage.isUserMemberOfOrg(userId, orgId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado a esta organização" });
    }
    
    const org = await storage.getOrganization(orgId);
    if (!org) return res.status(404).json({ message: "Organização não encontrada" });
    res.json(org);
  });

  app.post(api.organizations.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.organizations.create.input.parse(req.body);
      // Generate slug from name if not provided (simple version)
      const slug = input.slug || input.name.toLowerCase().replace(/ /g, '-');
      const org = await storage.createOrganization({ ...input, slug });
      
      // Auto-add creator as 'owner'
      const userId = await getResolvedUserId(req);
      await storage.addMember({
        organizationId: org.id,
        userId,
        role: 'owner'
      });

      res.status(201).json(org);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.get(api.organizations.members.list.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const orgId = Number(req.params.id);
    
    const currentMember = await storage.getMemberByUserId(userId, orgId);
    if (!currentMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const allMembers = await storage.getOrganizationMembers(orgId);

    const sanitizeMembers = (members: typeof allMembers) =>
      members.map(({ user, ...rest }) => ({ ...rest, user: sanitizeMemberUser(user) }));
    
    // Owner sees all members
    if (currentMember.role === 'owner') {
      res.json(sanitizeMembers(allMembers));
    } else if (currentMember.role === 'admin') {
      // Admin sees: themselves, owner (read-only), and roles they can manage
      // Admin does NOT see other admins
      const manageableRoles = getManageableRoles(currentMember.role as UserRole);
      const visibleMembers = allMembers.filter(m => 
        m.userId === userId || // themselves
        m.role === 'owner' || // owner (read-only, but visible)
        manageableRoles.includes(m.role as UserRole)
      );
      res.json(sanitizeMembers(visibleMembers));
    } else if (currentMember.role === 'coordinator') {
      // Coordinator sees: themselves and all interviewers in the organization
      // Note: Cannot filter by "their surveys" as there's no ownership field on surveys
      const visibleMembers = allMembers.filter(m => 
        m.userId === userId || // themselves
        m.role === 'interviewer'
      );
      res.json(sanitizeMembers(visibleMembers));
    } else {
      // Interviewers and viewers see only themselves
      const visibleMembers = allMembers.filter(m => m.userId === userId);
      res.json(sanitizeMembers(visibleMembers));
    }
  });

  // Get current user's membership in organization
  app.get(api.organizations.members.me.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const orgId = Number(req.params.id);
    
    const member = await storage.getMemberByUserId(userId, orgId);
    if (!member) {
      return res.status(404).json({ message: "Você não é membro desta organização" });
    }
    
    res.json({
      id: member.id,
      userId: member.userId,
      role: member.role,
      organizationId: member.organizationId,
    });
  });

  app.post(api.organizations.members.invite.path, isAuthenticated, requireOrgAccess("id", "members:invite"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const callerRole = req.orgMember!.role as UserRole;
      
      const input = api.organizations.members.invite.input.parse(req.body);
      
      // Never allow adding owners
      if (input.role === 'owner') {
        console.warn(`[SECURITY] Attempt to add owner role. Denied.`);
        return res.status(403).json({ message: "Não é possível convidar como proprietário" });
      }
      
      // Validate that caller can manage the requested role (respects RBAC + overrides)
      if (!canManageRole(callerRole, input.role as UserRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} cannot manage role ${input.role}. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para adicionar membros com essa função" });
      }
      
      console.log(`[AUDIT] User ${req.orgMember!.userId} (${callerRole}) adding member with role ${input.role}`)

      let user = await storage.getUserByEmail(input.email);
      let isNewUser = false;
      
      if (!user) {
        user = await storage.createUserByEmail(input.email.toLowerCase(), input.firstName, input.lastName);
        isNewUser = true;
      }
      
      // Update user profile with name and photo if provided
      if (input.firstName || input.lastName || input.profileImageUrl) {
        await storage.updateUserProfile(user.id, {
          firstName: input.firstName || user.firstName || undefined,
          lastName: input.lastName || user.lastName || undefined,
          profileImageUrl: input.profileImageUrl,
        });
      }

      const existingMember = await storage.getMemberByUserId(user.id, orgId);
      if (existingMember) {
        return res.status(400).json({ message: "Este usuário já é membro da organização" });
      }

      // If admin provided a password, set it directly
      if (input.password) {
        const { authService } = await import("./auth-service");
        await authService.setUserPasswordByAdmin(user.id, input.password);
      }

      const member = await storage.addMember({
        organizationId: orgId,
        userId: user.id,
        role: input.role
      });

      // Generate password setup token for pending users only if no password was provided
      let setupLink = null;
      if (user.authProvider === 'pending' && !input.password) {
        const { authService } = await import("./auth-service");
        const token = await authService.requestPasswordReset(input.email.toLowerCase());
        if (token) {
          const baseUrl = process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
            : `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN || 'localhost:5000'}`;
          setupLink = `${baseUrl}/reset-password?token=${token}`;
        }
      }

      res.status(201).json({ 
        ...member, 
        setupLink,
        needsSetup: user.authProvider === 'pending' && !input.password,
        passwordSet: !!input.password
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("Erro ao adicionar membro:", err);
      res.status(500).json({ message: "Erro ao adicionar membro" });
    }
  });

  app.get(api.organizations.invitations.list.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.id);
      
      const isMember = await storage.isUserMemberOfOrg(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const invitations = await storage.getPendingInvitationsByOrg(orgId);
      const formatted = invitations.map(inv => ({
        id: inv.id,
        organizationId: inv.organizationId,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        invitedAt: inv.invitedAt?.toISOString() || null,
        inviter: inv.inviter ? {
          firstName: inv.inviter.firstName,
          lastName: inv.inviter.lastName,
        } : undefined
      }));
      res.json(formatted);
    } catch (err) {
      res.status(500).json({ message: "Erro ao listar convites" });
    }
  });

  app.delete(api.organizations.invitations.cancel.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      
      // Authorization check - must be member of org
      const isMember = await storage.isUserMemberOfOrg(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const invitation = await storage.getPendingInvitationById(inviteId);
      if (!invitation || invitation.organizationId !== orgId) {
        return res.status(404).json({ message: "Convite não encontrado" });
      }
      await storage.cancelPendingInvitation(inviteId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao cancelar convite" });
    }
  });

  app.patch(api.organizations.members.updateRole.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const memberId = Number(req.params.memberId);
      
      const targetMember = await storage.getMemberById(memberId);
      if (!targetMember) return res.status(404).json({ message: "Membro não encontrado" });
      
      const orgId = targetMember.organizationId;
      
      const currentMember = await storage.getMemberByUserId(userId, orgId);
      if (!currentMember || !hasPermission(currentMember.role as UserRole, "members:edit_role")) {
        return res.status(403).json({ message: "Você não tem permissão para alterar funções" });
      }
      
      const callerRole = currentMember.role as UserRole;
      
      if (targetMember.role === 'owner') return res.status(403).json({ message: "Não é possível alterar a função do proprietário" });
      
      // Validate caller can manage the target member's current role
      if (!canManageRole(callerRole, targetMember.role as UserRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} cannot manage role ${targetMember.role}. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para alterar a função deste membro" });
      }
      
      const input = api.organizations.members.updateRole.input.parse(req.body);
      if (input.role === 'owner') {
        console.warn(`[SECURITY] Attempt to promote to owner. Denied.`);
        return res.status(403).json({ message: "Não é possível promover para proprietário" });
      }
      
      // Validate caller can assign the new role
      if (!canManageRole(callerRole, input.role as UserRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} cannot assign role ${input.role}. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para atribuir essa função" });
      }
      
      console.log(`[AUDIT] User ${userId} (${callerRole}) changing member ${memberId} role from ${targetMember.role} to ${input.role}`)
      
      const updated = await storage.updateMemberRole(memberId, input.role);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar membro" });
    }
  });

  app.delete(api.organizations.members.remove.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const memberId = Number(req.params.memberId);
      
      const targetMember = await storage.getMemberById(memberId);
      if (!targetMember) return res.status(404).json({ message: "Membro não encontrado" });
      
      const orgId = targetMember.organizationId;
      
      const currentMember = await storage.getMemberByUserId(userId, orgId);
      if (!currentMember || !hasPermission(currentMember.role as UserRole, "members:remove")) {
        return res.status(403).json({ message: "Você não tem permissão para remover membros" });
      }
      
      const callerRole = currentMember.role as UserRole;
      
      // Only owners and admins can remove members
      if (!['owner', 'admin'].includes(callerRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to remove member. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para remover membros" });
      }
      
      if (targetMember.role === 'owner') return res.status(403).json({ message: "Não é possível remover o proprietário" });
      
      // Only owners can remove admins
      if (targetMember.role === 'admin' && callerRole !== 'owner') {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to remove admin. Denied.`);
        return res.status(403).json({ message: "Apenas proprietários podem remover administradores" });
      }
      
      // Validate caller can manage the target member's role
      if (!canManageRole(callerRole, targetMember.role as UserRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} cannot remove role ${targetMember.role}. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para remover este membro" });
      }
      
      console.log(`[AUDIT] User ${userId} (${callerRole}) removing member ${memberId} with role ${targetMember.role}`)
      await storage.removeMember(memberId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao remover membro" });
    }
  });

  // Set password for a member (admin function)
  app.post(api.organizations.members.setPassword.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const memberId = Number(req.params.memberId);
      
      const input = api.organizations.members.setPassword.input.parse(req.body);
      
      const targetMember = await storage.getMemberById(memberId);
      if (!targetMember) return res.status(404).json({ message: "Membro não encontrado" });
      
      const orgId = targetMember.organizationId;
      
      const currentMember = await storage.getMemberByUserId(userId, orgId);
      if (!currentMember || !hasPermission(currentMember.role as UserRole, "members:invite")) {
        return res.status(403).json({ message: "Você não tem permissão para alterar senhas" });
      }
      
      const callerRole = currentMember.role as UserRole;
      
      // Only owners and admins can set passwords
      if (!['owner', 'admin'].includes(callerRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to set password. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para alterar senhas" });
      }
      
      if (targetMember.role === 'owner') return res.status(403).json({ message: "Não é possível alterar a senha do proprietário" });
      
      // Only owners can manage admin passwords
      if (targetMember.role === 'admin' && callerRole !== 'owner') {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to set admin password. Denied.`);
        return res.status(403).json({ message: "Apenas proprietários podem alterar senhas de administradores" });
      }
      
      // Validate caller can manage the target member's role
      if (!canManageRole(callerRole, targetMember.role as UserRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} cannot set password for role ${targetMember.role}. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para alterar a senha deste membro" });
      }
      
      console.log(`[AUDIT] User ${userId} (${callerRole}) setting password for member ${memberId}`)
      const { authService } = await import("./auth-service");
      await authService.setUserPasswordByAdmin(targetMember.userId, input.password);
      
      res.json({ success: true });
    } catch (err) {
      console.error("Erro ao definir senha:", err);
      res.status(500).json({ message: "Erro ao definir senha" });
    }
  });

  // Update member name
  app.patch(api.organizations.members.updateName.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const memberId = Number(req.params.memberId);
      
      const input = api.organizations.members.updateName.input.parse(req.body);
      
      const targetMember = await storage.getMemberById(memberId);
      if (!targetMember) return res.status(404).json({ message: "Membro não encontrado" });
      
      const orgId = targetMember.organizationId;
      
      const currentMember = await storage.getMemberByUserId(userId, orgId);
      if (!currentMember || !hasPermission(currentMember.role as UserRole, "members:invite")) {
        return res.status(403).json({ message: "Você não tem permissão para editar nomes" });
      }
      
      const callerRole = currentMember.role as UserRole;
      
      // Only owners and admins can edit other members' names
      if (!['owner', 'admin'].includes(callerRole) && currentMember.id !== targetMember.id) {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to edit name. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para editar nomes" });
      }
      
      if (targetMember.role === 'owner' && currentMember.id !== targetMember.id) {
        return res.status(403).json({ message: "Não é possível alterar o nome do proprietário" });
      }
      
      // Only owners can edit admin names
      if (targetMember.role === 'admin' && callerRole !== 'owner' && currentMember.id !== targetMember.id) {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to edit admin name. Denied.`);
        return res.status(403).json({ message: "Apenas proprietários podem editar nomes de administradores" });
      }
      
      if (!canManageRole(callerRole, targetMember.role as UserRole) && currentMember.id !== targetMember.id) {
        console.warn(`[SECURITY] User with role ${callerRole} cannot edit name for role ${targetMember.role}. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para editar o nome deste membro" });
      }
      
      console.log(`[AUDIT] User ${userId} (${callerRole}) editing name for member ${memberId}`)
      await storage.updateUserName(targetMember.userId, input.firstName, input.lastName || null);
      
      res.json({ success: true });
    } catch (err) {
      console.error("Erro ao atualizar nome:", err);
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar nome" });
    }
  });

  // Reset member login method (changes from replit to pending, allowing password setup)
  app.post(api.organizations.members.resetLogin.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const memberId = Number(req.params.memberId);
      
      const targetMember = await storage.getMemberById(memberId);
      if (!targetMember) return res.status(404).json({ message: "Membro não encontrado" });
      
      const orgId = targetMember.organizationId;
      
      const currentMember = await storage.getMemberByUserId(userId, orgId);
      if (!currentMember || !hasPermission(currentMember.role as UserRole, "members:invite")) {
        return res.status(403).json({ message: "Você não tem permissão para resetar login" });
      }
      
      const callerRole = currentMember.role as UserRole;
      
      // Only owners and admins can reset logins
      if (!['owner', 'admin'].includes(callerRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to reset login. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para resetar login" });
      }
      
      if (targetMember.role === 'owner') {
        return res.status(403).json({ message: "Não é possível resetar o login do proprietário" });
      }
      
      // Only owners can reset admin logins
      if (targetMember.role === 'admin' && callerRole !== 'owner') {
        console.warn(`[SECURITY] User with role ${callerRole} attempted to reset admin login. Denied.`);
        return res.status(403).json({ message: "Apenas proprietários podem resetar login de administradores" });
      }
      
      if (!canManageRole(callerRole, targetMember.role as UserRole)) {
        console.warn(`[SECURITY] User with role ${callerRole} cannot reset login for role ${targetMember.role}. Denied.`);
        return res.status(403).json({ message: "Você não tem permissão para resetar o login deste membro" });
      }
      
      console.log(`[AUDIT] User ${userId} (${callerRole}) resetting login for member ${memberId}`)
      const { authService } = await import("./auth-service");
      await authService.resetAuthProvider(targetMember.userId);
      
      res.json({ 
        success: true, 
        message: "Login resetado. O membro pode usar 'Esqueci minha senha' para configurar uma nova senha." 
      });
    } catch (err) {
      console.error("Erro ao resetar login:", err);
      res.status(500).json({ message: "Erro ao resetar login" });
    }
  });

  // Update member profile (unified: name, role, password, photo)
  app.patch("/api/organizations/:id/members/:memberId/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const memberId = Number(req.params.memberId);
      const orgId = Number(req.params.id);
      
      const input = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        role: z.string().optional(),
        password: z.string().min(6).optional(),
        profileImageUrl: z.string().optional(),
      }).parse(req.body);
      
      const targetMember = await storage.getMemberById(memberId);
      if (!targetMember || targetMember.organizationId !== orgId) {
        return res.status(404).json({ message: "Membro não encontrado" });
      }
      
      const currentMember = await storage.getMemberByUserId(userId, orgId);
      if (!currentMember || !hasPermission(currentMember.role as UserRole, "members:invite")) {
        return res.status(403).json({ message: "Você não tem permissão para editar membros" });
      }
      
      const callerRole = currentMember.role as UserRole;
      
      if (targetMember.role === 'owner' && currentMember.id !== targetMember.id) {
        return res.status(403).json({ message: "Não é possível alterar dados do proprietário" });
      }
      
      if (targetMember.role === 'admin' && callerRole !== 'owner' && currentMember.id !== targetMember.id) {
        return res.status(403).json({ message: "Apenas proprietários podem editar administradores" });
      }
      
      if (!canManageRole(callerRole, targetMember.role as UserRole) && currentMember.id !== targetMember.id) {
        return res.status(403).json({ message: "Você não tem permissão para editar este membro" });
      }
      
      // Update user profile (name, photo)
      if (input.firstName || input.lastName !== undefined || input.profileImageUrl !== undefined) {
        await storage.updateUserProfile(targetMember.userId, {
          firstName: input.firstName,
          lastName: input.lastName,
          profileImageUrl: input.profileImageUrl,
        });
      }
      
      // Update role if provided
      if (input.role && input.role !== targetMember.role) {
        if (!canManageRole(callerRole, input.role as UserRole)) {
          return res.status(403).json({ message: "Você não pode atribuir esta função" });
        }
        await storage.updateMemberRole(memberId, input.role);
      }
      
      // Update password if provided
      if (input.password) {
        const { authService } = await import("./auth-service");
        await authService.setUserPasswordByAdmin(targetMember.userId, input.password);
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error("Erro ao atualizar membro:", err);
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar membro" });
    }
  });

  app.patch("/api/organizations/:id", isAuthenticated, requireOrgAccess("id", "org:edit"), async (req, res) => {
    try {
      const org = await storage.getOrganization(req.orgMember!.organizationId);
      if (!org) return res.status(404).json({ message: "Organizacao nao encontrada" });
      
      const partialSchema = api.organizations.create.input.partial();
      const input = partialSchema.parse(req.body);
      const updated = await storage.updateOrganization(req.orgMember!.organizationId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar organizacao" });
    }
  });

  // Organization Domains - Custom domain management
  app.get("/api/organizations/:id/domains", isAuthenticated, requireOrgAccess("id", "org:edit"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const domains = await storage.getOrganizationDomains(orgId);
      res.json(domains);
    } catch (err) {
      res.status(500).json({ message: "Erro ao buscar dominios" });
    }
  });

  app.post("/api/organizations/:id/domains", isAuthenticated, requireOrgAccess("id", "org:edit"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const org = await storage.getOrganization(orgId);
      
      if (org?.plan !== 'enterprise') {
        return res.status(403).json({ message: "Dominios personalizados so estao disponiveis no plano Enterprise" });
      }
      
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ message: "Dominio e obrigatorio" });
      
      const newDomain = await storage.addOrganizationDomain({
        organizationId: orgId,
        domain,
        isSubdomain: false
      });
      res.status(201).json(newDomain);
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(400).json({ message: "Este dominio ja esta em uso" });
      }
      res.status(500).json({ message: "Erro ao adicionar dominio" });
    }
  });

  app.delete("/api/organizations/:id/domains/:domainId", isAuthenticated, requireOrgAccess("id", "org:edit"), async (req, res) => {
    try {
      const domainId = Number(req.params.domainId);
      await storage.removeOrganizationDomain(domainId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao remover dominio" });
    }
  });

  app.post("/api/organizations/:id/domains/:domainId/verify", isAuthenticated, requireOrgAccess("id", "org:edit"), async (req, res) => {
    try {
      const domainId = Number(req.params.domainId);
      const verified = await storage.verifyOrganizationDomain(domainId);
      res.json(verified);
    } catch (err) {
      res.status(500).json({ message: "Erro ao verificar dominio" });
    }
  });

  // 3. Surveys - SECURED with RBAC
  // Entrevistadores só veem pesquisas designadas a eles
  app.get(api.surveys.list.path, isAuthenticated, async (req, res) => {
    try {
      // Use getResolvedUserId to get internal ID (important for Replit Auth users)
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.orgId);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      console.log('[surveys/list] Debug:', { userId, orgId, member: member ? { id: member.id, role: member.role, memberId: member.userId } : null });
      
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      
      // Entrevistadores só veem pesquisas designadas e ativas
      if (isInterviewerRole(role)) {
        const assignedSurveys = await storage.getAssignedSurveys(userId, orgId);
        console.log('[surveys/list] Interviewer assigned surveys:', { userId, count: assignedSurveys.length, surveyIds: assignedSurveys.map(s => s.id) });
        // Filter to only show active surveys to interviewers
        const activeSurveys = assignedSurveys.filter(s => s.status === 'active');
        return res.json(activeSurveys);
      }
      
      // Coordenadores só veem pesquisas designadas a eles
      if (role === 'coordinator') {
        const assignedSurveys = await storage.getCoordinatorAssignedSurveys(userId, orgId);
        return res.json(assignedSurveys);
      }
      
      // Viewers só veem pesquisas designadas a eles
      if (role === 'viewer') {
        const assignedSurveys = await storage.getViewerAssignedSurveys(userId, orgId);
        console.log('[surveys/list] Viewer assigned surveys:', { userId, count: assignedSurveys.length, surveyIds: assignedSurveys.map(s => s.id) });
        return res.json(assignedSurveys);
      }
      
      // Outros usuários com permissão surveys:view veem todas (admin, owner)
      if (!hasPermission(role, "surveys:view")) {
        return res.status(403).json({ message: "Você não tem permissão para visualizar pesquisas" });
      }
      
      const surveys = await storage.getSurveys(orgId);
      res.json(surveys);
    } catch (err) {
      console.error("Erro ao listar pesquisas:", err);
      res.status(500).json({ message: "Erro ao listar pesquisas" });
    }
  });

  app.get(api.surveys.get.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const surveyId = Number(req.params.id);
    const survey = await storage.getSurvey(surveyId);
    if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
    
    // Debug log para verificar shuffleOptions nas perguntas
    console.log('[surveys/get] Survey questions shuffleOptions:', survey.questions?.map(q => ({
      id: q.id,
      text: q.text.substring(0, 30),
      shuffleOptions: q.shuffleOptions
    })));
    
    const member = await storage.getMemberByUserId(userId, survey.organizationId);
    if (!member) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const role = member.role as UserRole;
    
    // Entrevistadores só podem ver pesquisas designadas
    if (isInterviewerRole(role)) {
      const isAssigned = await storage.isInterviewerAssigned(surveyId, userId);
      if (!isAssigned) {
        return res.status(403).json({ message: "Você não está designado para esta pesquisa" });
      }
    } else if (role === 'coordinator') {
      // Coordenadores só podem ver pesquisas designadas
      const isAssigned = await storage.isCoordinatorAssigned(surveyId, userId);
      if (!isAssigned) {
        return res.status(403).json({ message: "Você não está designado para esta pesquisa" });
      }
    } else if (!hasPermission(role, "surveys:view")) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    // Include custom geofence polygon(s) if the survey has them
    let geofencePolygon: any = null;
    let geofenceCityPolygons: any[] = [];
    if ((survey as any).customGeofenceId) {
      const customFence = await storage.getCustomGeofenceById((survey as any).customGeofenceId);
      if (customFence) geofencePolygon = customFence.polygon;
    }
    if ((survey as any).geofenceCity) {
      const cityFences = await storage.getCustomGeofences(survey.organizationId);
      geofenceCityPolygons = cityFences
        .filter((f: any) => f.city === (survey as any).geofenceCity)
        .map((f: any) => ({ id: f.id, name: f.name, polygon: f.polygon, populationCount: f.populationCount }));
    }
    res.json({ ...survey, geofencePolygon, geofenceCityPolygons });
  });

  app.post(api.surveys.create.path, isAuthenticated, requireOrgAccess("orgId", "surveys:create"), async (req, res) => {
    try {
      const input = api.surveys.create.input.parse(req.body);
      const survey = await storage.createSurvey({ 
        ...input, 
        organizationId: req.orgMember!.organizationId 
      });
      res.status(201).json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.patch(api.surveys.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.id);
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa nao encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para editar pesquisas" });
      }
      
      const input = api.surveys.update.input.parse(req.body);
      const updated = await storage.updateSurvey(surveyId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  // ============= SURVEY TRASH/DELETE/DUPLICATE =============
  
  // List trashed surveys
  app.get("/api/organizations/:orgId/surveys/trash", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.orgId);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const trashedSurveys = await storage.getTrashedSurveys(orgId);
      res.json(trashedSurveys);
    } catch (err) {
      console.error("Erro ao listar lixeira:", err);
      res.status(500).json({ message: "Erro ao listar pesquisas na lixeira" });
    }
  });

  // Move survey to trash (soft delete)
  app.post("/api/surveys/:id/trash", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.id);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para excluir pesquisas" });
      }
      
      const deleted = await storage.softDeleteSurvey(surveyId, userId);
      res.json(deleted);
    } catch (err) {
      console.error("Erro ao mover para lixeira:", err);
      res.status(500).json({ message: "Erro ao mover pesquisa para lixeira" });
    }
  });

  // Restore survey from trash
  app.post("/api/surveys/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.id);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para restaurar pesquisas" });
      }
      
      const restored = await storage.restoreSurvey(surveyId);
      res.json(restored);
    } catch (err) {
      console.error("Erro ao restaurar:", err);
      res.status(500).json({ message: "Erro ao restaurar pesquisa" });
    }
  });

  // Permanently delete survey
  app.delete("/api/surveys/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.id);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para excluir pesquisas" });
      }
      
      // Only allow permanent deletion of already trashed surveys
      if (!survey.deletedAt) {
        return res.status(400).json({ message: "Mova a pesquisa para a lixeira antes de excluir permanentemente" });
      }
      
      await storage.permanentlyDeleteSurvey(surveyId);
      res.status(204).send();
    } catch (err) {
      console.error("Erro ao excluir permanentemente:", err);
      res.status(500).json({ message: "Erro ao excluir pesquisa permanentemente" });
    }
  });

  // Duplicate survey
  app.post("/api/surveys/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.id);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:create")) {
        return res.status(403).json({ message: "Você não tem permissão para duplicar pesquisas" });
      }
      
      const { title } = req.body;
      const newTitle = title || `${survey.title} (Cópia)`;
      
      const duplicated = await storage.duplicateSurvey(surveyId, newTitle, userId);
      res.status(201).json(duplicated);
    } catch (err) {
      console.error("Erro ao duplicar:", err);
      res.status(500).json({ message: "Erro ao duplicar pesquisa" });
    }
  });

  // 4. Questions - SECURED with RBAC
  app.post(api.questions.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para editar pesquisas" });
      }
      
      const input = api.questions.create.input.parse(req.body);
      const question = await storage.createQuestion({ 
        ...input, 
        surveyId 
      });
      res.status(201).json(question);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.patch(api.questions.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const questionId = Number(req.params.id);
      
      console.log('[questions/update] Request body:', JSON.stringify(req.body, null, 2));
      
      // Primeiro buscar a pergunta para obter o surveyId
      const question = await storage.getQuestion(questionId);
      if (!question) return res.status(404).json({ message: "Pergunta não encontrada" });
      
      const survey = await storage.getSurvey(question.surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para editar pesquisas" });
      }
      
      const input = api.questions.update.input.parse(req.body);
      console.log('[questions/update] Parsed input:', JSON.stringify(input, null, 2));
      const updated = await storage.updateQuestion(questionId, input);
      console.log('[questions/update] Updated question:', JSON.stringify(updated, null, 2));
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.delete(api.questions.delete.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const questionId = Number(req.params.id);
      
      // Primeiro buscar a pergunta para obter o surveyId
      const question = await storage.getQuestion(questionId);
      if (!question) return res.status(404).json({ message: "Pergunta não encontrada" });
      
      const survey = await storage.getSurvey(question.surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:delete")) {
        return res.status(403).json({ message: "Você não tem permissão para deletar perguntas" });
      }
      
      await storage.deleteQuestion(questionId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao deletar pergunta" });
    }
  });

  // Survey Assignments - Designar entrevistadores para pesquisas
  app.get("/api/surveys/:surveyId/assignments", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) return res.status(403).json({ message: "Acesso negado" });
      
      const assignments = await storage.getSurveyAssignments(surveyId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Erro ao listar designações" });
    }
  });

  app.post("/api/surveys/:surveyId/assignments", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para designar entrevistadores" });
      }
      
      const { interviewerId } = req.body;
      if (!interviewerId) {
        return res.status(400).json({ message: "ID do entrevistador é obrigatório" });
      }
      
      // Check if interviewer is a member of the organization
      const interviewerMember = await storage.getMemberByUserId(interviewerId, survey.organizationId);
      if (!interviewerMember) {
        return res.status(400).json({ message: "O usuário não é membro desta organização" });
      }
      
      // Check if already assigned
      const isAssigned = await storage.isInterviewerAssigned(surveyId, interviewerId);
      if (isAssigned) {
        return res.status(400).json({ message: "Entrevistador já está designado para esta pesquisa" });
      }
      
      const assignment = await storage.assignInterviewer({
        surveyId,
        interviewerId,
        assignedBy: userId
      });
      
      res.status(201).json(assignment);
    } catch (err) {
      res.status(500).json({ message: "Erro ao designar entrevistador" });
    }
  });

  app.delete("/api/surveys/:surveyId/assignments/:interviewerId", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      const interviewerId = req.params.interviewerId;
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para remover designações" });
      }
      
      await storage.unassignInterviewer(surveyId, interviewerId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao remover designação" });
    }
  });

  // Get interviewers available for assignment (members with interviewer role)
  app.get("/api/organizations/:id/interviewers", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.id);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) return res.status(403).json({ message: "Acesso negado" });
      
      const members = await storage.getOrganizationMembers(orgId);
      // Filter to only interviewers
      const interviewers = members.filter(m => m.role === 'interviewer');
      res.json(interviewers);
    } catch (err) {
      res.status(500).json({ message: "Erro ao listar entrevistadores" });
    }
  });

  // ============= SURVEY COORDINATORS =============
  
  // List coordinators for a survey
  app.get("/api/surveys/:surveyId/coordinators", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) return res.status(403).json({ message: "Acesso negado" });
      
      const coordinators = await storage.getSurveyCoordinators(surveyId);
      res.json(coordinators);
    } catch (err) {
      res.status(500).json({ message: "Erro ao listar coordenadores" });
    }
  });

  // Assign coordinator to survey
  app.post("/api/surveys/:surveyId/coordinators", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para designar coordenadores" });
      }
      
      const { coordinatorId } = req.body;
      if (!coordinatorId) {
        return res.status(400).json({ message: "ID do coordenador é obrigatório" });
      }
      
      // Check if coordinator is a member of the organization with coordinator role
      const coordinatorMember = await storage.getMemberByUserId(coordinatorId, survey.organizationId);
      if (!coordinatorMember) {
        return res.status(400).json({ message: "O usuário não é membro desta organização" });
      }
      
      if (coordinatorMember.role !== 'coordinator') {
        return res.status(400).json({ message: "O usuário não tem a função de coordenador" });
      }
      
      // Check if already assigned
      const isAssigned = await storage.isCoordinatorAssigned(surveyId, coordinatorId);
      if (isAssigned) {
        return res.status(400).json({ message: "Coordenador já está designado para esta pesquisa" });
      }
      
      const assignment = await storage.assignCoordinator({
        surveyId,
        coordinatorId,
        assignedBy: userId
      });
      
      res.status(201).json(assignment);
    } catch (err) {
      res.status(500).json({ message: "Erro ao designar coordenador" });
    }
  });

  // Remove coordinator from survey
  app.delete("/api/surveys/:surveyId/coordinators/:coordinatorId", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      const coordinatorId = req.params.coordinatorId;
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para remover designações" });
      }
      
      await storage.unassignCoordinator(surveyId, coordinatorId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao remover coordenador" });
    }
  });
  
  // Get coordinators available for assignment (members with coordinator role)
  app.get("/api/organizations/:id/coordinators", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.id);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) return res.status(403).json({ message: "Acesso negado" });
      
      const members = await storage.getOrganizationMembers(orgId);
      // Filter to only coordinators
      const coordinators = members.filter(m => m.role === 'coordinator');
      res.json(coordinators);
    } catch (err) {
      res.status(500).json({ message: "Erro ao listar coordenadores" });
    }
  });

  // ============= SURVEY VIEWERS =============
  
  // List viewers for a survey
  app.get("/api/surveys/:surveyId/viewers", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) return res.status(403).json({ message: "Acesso negado" });
      
      const viewers = await storage.getSurveyViewers(surveyId);
      res.json(viewers);
    } catch (err) {
      res.status(500).json({ message: "Erro ao listar visualizadores" });
    }
  });

  // Assign viewer to survey
  app.post("/api/surveys/:surveyId/viewers", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para designar visualizadores" });
      }
      
      const { viewerId } = req.body;
      if (!viewerId) {
        return res.status(400).json({ message: "ID do visualizador é obrigatório" });
      }
      
      // Check if viewer is a member of the organization with viewer role
      const viewerMember = await storage.getMemberByUserId(viewerId, survey.organizationId);
      if (!viewerMember) {
        return res.status(400).json({ message: "O usuário não é membro desta organização" });
      }
      
      if (viewerMember.role !== 'viewer') {
        return res.status(400).json({ message: "O usuário não tem a função de visualizador" });
      }
      
      // Check if already assigned
      const isAssigned = await storage.isViewerAssigned(surveyId, viewerId);
      if (isAssigned) {
        return res.status(400).json({ message: "Visualizador já está designado para esta pesquisa" });
      }
      
      const assignment = await storage.assignViewer({
        surveyId,
        viewerId,
        assignedBy: userId
      });
      
      res.status(201).json(assignment);
    } catch (err) {
      res.status(500).json({ message: "Erro ao designar visualizador" });
    }
  });

  // Remove viewer from survey
  app.delete("/api/surveys/:surveyId/viewers/:viewerId", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      const viewerId = req.params.viewerId;
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para remover designações" });
      }
      
      await storage.unassignViewer(surveyId, viewerId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao remover visualizador" });
    }
  });
  
  // Get viewers available for assignment (members with viewer role)
  app.get("/api/organizations/:id/viewers", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.id);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) return res.status(403).json({ message: "Acesso negado" });
      
      const members = await storage.getOrganizationMembers(orgId);
      // Filter to only viewers
      const viewers = members.filter(m => m.role === 'viewer');
      res.json(viewers);
    } catch (err) {
      res.status(500).json({ message: "Erro ao listar visualizadores" });
    }
  });

  // ============= SURVEY VIEWER SETTINGS =============
  
  // Get viewer settings for a survey
  app.get("/api/surveys/:surveyId/viewer-settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) return res.status(403).json({ message: "Acesso negado" });
      
      const settings = await storage.getSurveyViewerSettings(surveyId);
      
      // Return default settings if none exist
      if (!settings) {
        return res.json({
          surveyId,
          showFilters: false,
          filterAgeGroup: false,
          filterGender: false,
          filterNeighborhood: false,
          filterInterviewer: false,
          showIntentionTab: true,
          showEvolutionTab: false,
          showCrossingsTab: false,
          showProfileTab: false,
          showReportTab: false,
          showMainResult: true,
          showDemographicBreakdowns: false,
          showGenderBreakdown: false,
          showAgeBreakdown: false,
          showNeighborhoodBreakdown: false,
          showInterviewerStats: false,
          allowExcelExport: false,
          allowPdfExport: false,
        });
      }
      
      res.json(settings);
    } catch (err) {
      res.status(500).json({ message: "Erro ao buscar configurações" });
    }
  });

  // Update viewer settings for a survey
  app.put("/api/surveys/:surveyId/viewer-settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para editar configurações" });
      }
      
      const settings = await storage.upsertSurveyViewerSettings(surveyId, req.body, userId);
      res.json(settings);
    } catch (err) {
      res.status(500).json({ message: "Erro ao salvar configurações" });
    }
  });

  // 5. Responses (Collection) - CRITICAL: GPS & Audio Validation - SECURED
  app.post(api.responses.submit.path, isAuthenticated, async (req, res) => {
    try {
      const interviewerId = getUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      // Get survey to check org membership
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const isMember = await storage.isUserMemberOfOrg(interviewerId, survey.organizationId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      // Check organization plan limits
      const org = await storage.getOrganization(survey.organizationId);
      if (org) {
        const stats = await storage.getOrganizationStats(survey.organizationId);
        const maxInterviews = org.maxInterviews || 100;
        
        if (stats.interviewsThisMonth >= maxInterviews) {
          return res.status(403).json({ 
            message: `Limite mensal de ${maxInterviews} entrevistas atingido. Faça upgrade do seu plano para continuar.`,
            code: "LIMIT_EXCEEDED",
            currentUsage: stats.interviewsThisMonth,
            limit: maxInterviews
          });
        }
      }
      
      const { clientId, response: responseMeta, answers } = api.responses.submit.input.parse(req.body);

      // DEDUPLICATION: Check if response with this clientId already exists
      if (clientId) {
        const existingResponse = await storage.getResponseByClientId(clientId);
        if (existingResponse) {
          console.log(`[Dedup] Response with clientId ${clientId} already exists (id: ${existingResponse.id}), returning existing`);
          return res.status(200).json({ 
            id: existingResponse.id, 
            status: existingResponse.status,
            deduplicated: true 
          });
        }
      }

      // GEOFENCE NOTE: Zone validation is enforced client-side at interview START only.
      // The GPS position check is intentionally NOT repeated here at submit time because:
      // 1. GPS drift during a long interview can place the device outside the polygon
      // 2. The interviewer already passed the zone check before answering any questions
      // 3. Blocking at submit would discard a completed, valid interview unfairly

      // Backend Validation Logic for Fraud Detection
      let status = "valid";
      let flagReason = null;

      // Check survey settings for GPS/Audio requirements
      const requireGps = survey.requireGps ?? true;
      const requireAudio = survey.requireAudio ?? true;

      // 1. Validação de Áudio (apenas se obrigatório)
      if (requireAudio && (!responseMeta.audioUrl || !responseMeta.audioHash || responseMeta.audioHash === 'no-audio')) {
         return res.status(400).json({ message: "Evidência de áudio obrigatória não encontrada" });
      }
      
      // 2. Verificação de Duração (muito rápido indica fraude)
      if (responseMeta.duration && responseMeta.duration < 10) {
        status = "suspicious";
        flagReason = "Duração muito curta (<10s)";
      }

      const newResponse = await storage.createResponse(
        { 
          ...responseMeta, 
          clientId,
          surveyId: Number(req.params.surveyId),
          interviewerId,
          status,
          flagReason
        },
        answers
      );

      // T002: Duplicate answer pattern detection
      // Check if another response for this survey has an identical set of answers
      try {
        const newFp = await db.execute(sql`
          SELECT md5(string_agg(question_id::text || ':' || value::text, ',' ORDER BY question_id)) AS fp
          FROM answers WHERE response_id = ${newResponse.id}
        `);
        const fp = (newFp.rows?.[0] as any)?.fp;
        if (fp) {
          const dupRows = await db.execute(sql`
            SELECT r.id FROM responses r
            WHERE r.survey_id = ${surveyId}
              AND r.id != ${newResponse.id}
              AND (
                SELECT md5(string_agg(question_id::text || ':' || value::text, ',' ORDER BY question_id))
                FROM answers WHERE response_id = r.id
              ) = ${fp}
            LIMIT 1
          `);
          if (dupRows.rows && dupRows.rows.length > 0) {
            const existingFlag = newResponse.flagReason;
            const dupFlag = 'Padrão de respostas idêntico detectado';
            const combinedFlag = existingFlag ? `${existingFlag} | ${dupFlag}` : dupFlag;
            await db.execute(sql`
              UPDATE responses SET status = 'suspicious', flag_reason = ${combinedFlag}
              WHERE id = ${newResponse.id}
            `);
            return res.status(201).json({ id: newResponse.id, status: 'suspicious', duplicateDetected: true });
          }
        }
      } catch (e) {
        console.error('[DupCheck] Error checking duplicate answers:', e);
      }

      // T013: AI Fraud Score — weighted heuristic scoring (0-100)
      try {
        let score = 0;
        const r = responseMeta;
        // GPS accuracy risk
        if (r.accuracy > 500) score += 40;
        else if (r.accuracy > 150) score += 20;
        // Interview duration risk
        if (r.duration != null) {
          if (r.duration < 10) score += 50;
          else if (r.duration < 60) score += 35;
          else if (r.duration < 120) score += 15;
        }
        // Time of day risk (midnight to 5am)
        const hour = new Date(r.endTime).getHours();
        if (hour >= 0 && hour < 5) score += 20;
        // Audio too short
        if (r.audioDuration != null && r.audioDuration < 30) score += 20;
        // Already suspicious from earlier checks
        if (status === 'suspicious') score += 30;
        // GPS clustering: same exact coords as another response in same survey
        const gpsCluster = await db.execute(sql`
          SELECT COUNT(*) as cnt FROM responses
          WHERE survey_id = ${surveyId}
            AND id != ${newResponse.id}
            AND ABS(latitude - ${r.latitude}) < 0.0001
            AND ABS(longitude - ${r.longitude}) < 0.0001
        `);
        if (parseInt((gpsCluster.rows?.[0] as any)?.cnt || '0') > 0) score += 20;

        const fraudScore = Math.min(100, score);
        await db.execute(sql`UPDATE responses SET fraud_score = ${fraudScore} WHERE id = ${newResponse.id}`);
      } catch (e) {
        console.error('[FraudScore] Error computing score:', e);
      }

      // T010: WhatsApp alert when survey quota is reached
      if (survey.targetSample) {
        try {
          const countRows = await db.execute(sql`SELECT COUNT(*) as cnt FROM responses WHERE survey_id = ${surveyId} AND status != 'invalid'`);
          const total = parseInt((countRows.rows?.[0] as any)?.cnt || '0');
          if (total >= survey.targetSample && total - 1 < survey.targetSample) {
            const org = await storage.getOrganization(survey.organizationId);
            if (org?.whatsappPhone) {
              await sendWhatsAppMessage(
                org.whatsappPhone,
                `✅ *Cota Atingida!*\n` +
                `A pesquisa *${survey.title}* atingiu a meta de ${survey.targetSample} entrevistas.\n` +
                `Total atual: *${total}* respostas válidas.\nConsidere pausar a coleta.`
              ).catch(e => console.error('[quota/whatsapp]', e));
            }
          }
        } catch (e) {
          console.error('[QuotaCheck] Error:', e);
        }
      }

      res.status(201).json({ id: newResponse.id, status: newResponse.status });
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.get(api.responses.list.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const surveyId = Number(req.params.surveyId);
    
    // Get survey to check org membership
    const survey = await storage.getSurvey(surveyId);
    if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
    
    const isMember = await storage.isUserMemberOfOrg(userId, survey.organizationId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const responses = await storage.getResponses(surveyId);
    res.json(responses);
  });

  app.get(api.analytics.surveySummary.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const surveyId = Number(req.params.id);
    
    // Get survey to check org membership
    const survey = await storage.getSurvey(surveyId);
    if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
    
    const isMember = await storage.isUserMemberOfOrg(userId, survey.organizationId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const analytics = await storage.getSurveyAnalytics(surveyId);
    res.json(analytics);
  });

  app.get(api.analytics.organizationStats.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const orgId = Number(req.params.id);
    
    const isMember = await storage.isUserMemberOfOrg(userId, orgId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const stats = await storage.getOrganizationStats(orgId);
    res.json(stats);
  });

  // === AUDIT / RESPONSE STATUS ===
  app.patch(api.responses.updateStatus.path, isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const responseId = Number(req.params.id);
      
      const response = await storage.getResponse(responseId);
      if (!response) {
        return res.status(404).json({ message: "Resposta não encontrada" });
      }
      
      const survey = await storage.getSurvey(response.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Pesquisa não encontrada" });
      }
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !['owner', 'admin', 'coordinator'].includes(member.role)) {
        return res.status(403).json({ message: "Apenas coordenadores ou administradores podem auditar respostas" });
      }
      
      const { status, reviewNote } = api.responses.updateStatus.input.parse(req.body);
      const updated = await storage.updateResponseStatus(responseId, status, reviewNote);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  // Bulk update response status (batch approve/invalidate)
  app.post("/api/organizations/:orgId/audit/responses/bulk-update", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.orgId);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member || !['owner', 'admin', 'coordinator'].includes(member.role)) {
        return res.status(403).json({ message: "Apenas coordenadores ou administradores podem atualizar entrevistas" });
      }
      
      const schema = z.object({
        responseIds: z.array(z.number()).min(1),
        status: z.enum(['valid', 'invalid', 'suspicious']),
        reviewNote: z.string().optional()
      });
      
      const { responseIds, status, reviewNote } = schema.parse(req.body);
      
      // Update all responses
      const results = await Promise.all(
        responseIds.map(id => storage.updateResponseStatus(id, status, reviewNote))
      );
      
      res.json({ updated: results.length, responses: results });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.get(api.responses.listByOrg.path, isAuthenticated, async (req, res) => {
    const userId = await getResolvedUserId(req);
    const orgId = Number(req.params.orgId);
    
    const isMember = await storage.isUserMemberOfOrg(userId, orgId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const responses = await storage.getResponsesByOrg(orgId);
    res.json(responses);
  });

  // === INTERVIEWER COMPARISON (Audit) ===
  app.get("/api/organizations/:orgId/audit/interviewers", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.orgId);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member || !['owner', 'admin', 'coordinator'].includes(member.role)) {
        return res.status(403).json({ message: "Apenas coordenadores ou administradores podem acessar auditoria" });
      }
      
      const filters: {
        surveyId?: number;
        questionId?: number;
        interviewerIds?: string[];
        startDate?: Date;
        endDate?: Date;
      } = {};
      
      if (req.query.surveyId) filters.surveyId = Number(req.query.surveyId);
      if (req.query.questionId) filters.questionId = Number(req.query.questionId);
      if (req.query.interviewerIds) {
        const ids = req.query.interviewerIds;
        filters.interviewerIds = Array.isArray(ids) ? ids as string[] : [ids as string];
      }
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);
      
      const comparison = await storage.getInterviewerComparison(orgId, filters);
      res.json(comparison);
    } catch (err) {
      console.error("Erro ao buscar comparacao de entrevistadores:", err);
      res.status(500).json({ message: "Erro ao buscar dados de comparacao" });
    }
  });

  // === RESULTS DASHBOARD (For Viewers/Contractors) - Aggregated Data Only ===
  app.get("/api/surveys/:surveyId/results/aggregated", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      
      // Entrevistadores não podem ver resultados
      if (isInterviewerRole(role)) {
        return res.status(403).json({ message: "Você não tem permissão para ver resultados" });
      }
      
      // Verificar se tem permissão de analytics
      if (!hasPermission(role, "analytics:view") && !hasPermission(role, "analytics:view_aggregate")) {
        return res.status(403).json({ message: "Você não tem permissão para ver resultados" });
      }
      
      // Viewers só podem ver resultados de pesquisas atribuídas
      if (role === 'viewer') {
        const isAssigned = await storage.isViewerAssigned(surveyId, userId);
        if (!isAssigned) {
          return res.status(403).json({ message: "Você não está atribuído a esta pesquisa" });
        }
      }
      
      // Build filters from query params
      const filters: {
        interviewerId?: string;
        neighborhood?: string;
        ageRange?: string;
        gender?: string;
        education?: string;
      } = {};
      if (req.query.interviewerId) filters.interviewerId = req.query.interviewerId as string;
      if (req.query.neighborhood) filters.neighborhood = req.query.neighborhood as string;
      if (req.query.ageRange) filters.ageRange = req.query.ageRange as string;
      if (req.query.gender) filters.gender = req.query.gender as string;
      if (req.query.education) filters.education = req.query.education as string;
      
      const aggregatedResults = await storage.getSurveyAggregatedResults(surveyId, filters);
      res.json(aggregatedResults);
    } catch (err) {
      console.error("Erro ao buscar resultados agregados:", err);
      res.status(500).json({ message: "Erro ao buscar resultados" });
    }
  });

  // Lista de entrevistadores para filtro
  app.get("/api/surveys/:surveyId/interviewers", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      
      // Viewers só podem acessar dados de pesquisas atribuídas
      if (role === 'viewer') {
        const isAssigned = await storage.isViewerAssigned(surveyId, userId);
        if (!isAssigned) {
          return res.status(403).json({ message: "Você não está atribuído a esta pesquisa" });
        }
      }
      
      const interviewers = await storage.getSurveyInterviewers(surveyId);
      res.json(interviewers);
    } catch (error) {
      console.error("Error fetching interviewers:", error);
      res.status(500).json({ message: "Erro ao buscar entrevistadores" });
    }
  });

  // Evolução temporal das respostas
  app.get("/api/surveys/:surveyId/results/timeline", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      if (isInterviewerRole(role)) {
        return res.status(403).json({ message: "Você não tem permissão para ver resultados" });
      }
      
      if (!hasPermission(role, "analytics:view") && !hasPermission(role, "analytics:view_aggregate")) {
        return res.status(403).json({ message: "Você não tem permissão para ver resultados" });
      }
      
      // Viewers só podem ver resultados de pesquisas atribuídas
      if (role === 'viewer') {
        const isAssigned = await storage.isViewerAssigned(surveyId, userId);
        if (!isAssigned) {
          return res.status(403).json({ message: "Você não está atribuído a esta pesquisa" });
        }
      }
      
      const timeline = await storage.getSurveyTimeline(surveyId);
      res.json(timeline);
    } catch (err) {
      console.error("Erro ao buscar timeline:", err);
      res.status(500).json({ message: "Erro ao buscar timeline" });
    }
  });

  // Export survey data as CSV
  app.get("/api/surveys/:surveyId/export", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      const format = (req.query.format as string) || 'csv';
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      if (isInterviewerRole(role)) {
        return res.status(403).json({ message: "Você não tem permissão para exportar dados" });
      }
      
      if (!hasPermission(role, "analytics:view")) {
        return res.status(403).json({ message: "Você não tem permissão para exportar dados" });
      }
      
      // Get all responses with answers
      const responsesData = await storage.getResponsesWithAnswers(surveyId);
      const questions = survey.questions || [];
      
      // Build CSV
      const headers = [
        'ID',
        'Entrevistador',
        'Data/Hora',
        'Latitude',
        'Longitude',
        'Precisão GPS (m)',
        'Duração (s)',
        'Status',
        ...questions.map(q => q.text)
      ];
      
      const rows = responsesData.map(r => {
        const answerMap = new Map(r.answers.map(a => [a.questionId, a.value]));
        return [
          r.id,
          r.interviewerId,
          new Date(r.createdAt!).toLocaleString('pt-BR'),
          r.latitude,
          r.longitude,
          r.accuracy?.toFixed(1) || '',
          r.duration || '',
          r.status,
          ...questions.map(q => {
            const value = answerMap.get(q.id);
            if (Array.isArray(value)) return value.join('; ');
            return value || '';
          })
        ];
      });
      
      // Generate CSV content
      const escapeCSV = (val: any) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');
      
      // Add BOM for Excel UTF-8 compatibility
      const bom = '\uFEFF';
      const csvWithBom = bom + csvContent;
      
      const filename = `${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvWithBom);
    } catch (err) {
      console.error("Erro ao exportar dados:", err);
      res.status(500).json({ message: "Erro ao exportar dados" });
    }
  });

  // === SURVEY TEMPLATE IMPORT/EXPORT (for migration between environments) ===
  
  // Export survey structure as JSON template (admin/owner only)
  app.get("/api/surveys/:surveyId/export-template", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      // Only owner and admin can export templates
      if (role !== 'owner' && role !== 'admin') {
        return res.status(403).json({ message: "Apenas administradores e proprietários podem exportar templates" });
      }
      
      // Questions are included with the survey from getSurvey
      const questions = survey.questions || [];
      
      // Build template object (excluding IDs and organization-specific data)
      const template = {
        _veracityTemplate: true,
        _version: "1.0",
        _exportedAt: new Date().toISOString(),
        survey: {
          title: survey.title,
          description: survey.description,
          type: survey.type,
          location: survey.location,
          targetSample: survey.targetSample,
          marginOfError: survey.marginOfError,
          quotas: survey.quotas,
          shuffleQuestions: survey.shuffleQuestions,
          requireGps: survey.requireGps,
          requireAudio: survey.requireAudio,
        },
        questions: questions.map((q: any, index: number) => ({
          text: q.text,
          type: q.type,
          options: q.options,
          order: q.order ?? index,
          required: q.required,
          logic: q.logic,
          shuffleOptions: q.shuffleOptions,
          showOptionImages: q.showOptionImages,
        })),
      };
      
      const filename = `${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_template_${new Date().toISOString().split('T')[0]}.json`;
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(template);
    } catch (err) {
      console.error("Erro ao exportar template:", err);
      res.status(500).json({ message: "Erro ao exportar template" });
    }
  });

  // Import survey from JSON template (admin/owner only)
  app.post("/api/organizations/:orgId/surveys/import-template", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.orgId);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      // Only owner and admin can import templates
      if (role !== 'owner' && role !== 'admin') {
        return res.status(403).json({ message: "Apenas administradores e proprietários podem importar templates" });
      }
      
      const template = req.body;
      
      // Validate template structure
      if (!template._veracityTemplate) {
        return res.status(400).json({ message: "Arquivo inválido. Este não parece ser um template de pesquisa Veracity." });
      }
      
      if (!template.survey || !template.survey.title) {
        return res.status(400).json({ message: "Template inválido: pesquisa não encontrada no arquivo." });
      }
      
      // Create the survey (always as draft)
      const surveyData = {
        organizationId: orgId,
        title: template.survey.title + " (Importado)",
        description: template.survey.description || null,
        type: template.survey.type || "electoral",
        status: "draft", // Always start as draft
        location: template.survey.location || null,
        targetSample: template.survey.targetSample || null,
        marginOfError: template.survey.marginOfError || null,
        quotas: template.survey.quotas || null,
        shuffleQuestions: template.survey.shuffleQuestions || false,
        requireGps: template.survey.requireGps !== false,
        requireAudio: template.survey.requireAudio !== false,
        startDate: null, // Reset dates
        endDate: null,
      };
      
      const newSurvey = await storage.createSurvey(surveyData);
      
      // Create questions if present
      if (template.questions && Array.isArray(template.questions)) {
        for (const [index, q] of template.questions.entries()) {
          await storage.createQuestion({
            surveyId: newSurvey.id,
            text: q.text || "Pergunta sem texto",
            type: q.type || "single_choice",
            options: q.options || null,
            order: q.order ?? index,
            required: q.required !== false,
            logic: q.logic || null,
            shuffleOptions: q.shuffleOptions || false,
            showOptionImages: q.showOptionImages || false,
          });
        }
      }
      
      res.status(201).json({
        message: "Pesquisa importada com sucesso",
        survey: newSurvey,
        questionsImported: template.questions?.length || 0,
      });
    } catch (err) {
      console.error("Erro ao importar template:", err);
      res.status(500).json({ message: "Erro ao importar template" });
    }
  });

  // === ACCESS CONTROL & PERMISSIONS ===
  
  // Get role matrix (permissions for each role)
  app.get("/api/organizations/:id/access/roles", isAuthenticated, requireOrgAccess("id", "members:view"), async (req, res) => {
    try {
      const { getPermissions } = await import("@shared/rbac");
      const roles = ['owner', 'admin', 'coordinator', 'interviewer', 'viewer'] as const;
      const permissions = [
        "org:view", "org:edit", "org:delete", "org:manage_billing", "org:manage_branding",
        "members:view", "members:invite", "members:edit_role", "members:remove",
        "surveys:view", "surveys:view_assigned", "surveys:create", "surveys:edit", "surveys:delete", "surveys:publish",
        "responses:view", "responses:view_own", "responses:submit", "responses:audit", "responses:invalidate",
        "analytics:view", "analytics:view_aggregate",
        "audio:listen", "gps:view", "audit_logs:view"
      ];
      
      const matrix = roles.map(role => ({
        role,
        permissions: permissions.map(perm => ({
          permission: perm,
          allowed: getPermissions(role).includes(perm as any)
        }))
      }));
      
      res.json({ roles, permissions, matrix });
    } catch (err) {
      console.error("Erro ao buscar matriz de permissões:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Get permission overrides for organization
  app.get("/api/organizations/:id/access/overrides", isAuthenticated, requireOrgAccess("id", "members:view"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const overrides = await storage.getOrgPermissionOverrides(orgId);
      res.json(overrides);
    } catch (err) {
      console.error("Erro ao buscar overrides:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Add permission override
  app.post("/api/organizations/:id/access/overrides", isAuthenticated, requireOrgAccess("id", "members:edit_role"), async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const { memberId, permission, allowed, reason, expiresAt } = req.body;
      
      if (!memberId || !permission || allowed === undefined) {
        return res.status(400).json({ message: "Dados incompletos" });
      }
      
      const override = await storage.addPermissionOverride({
        memberId,
        permission,
        allowed,
        grantedBy: userId,
        reason: reason || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });
      
      res.status(201).json(override);
    } catch (err) {
      console.error("Erro ao adicionar override:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Remove permission override
  app.delete("/api/organizations/:id/access/overrides/:overrideId", isAuthenticated, requireOrgAccess("id", "members:edit_role"), async (req, res) => {
    try {
      const overrideId = Number(req.params.overrideId);
      await storage.removePermissionOverride(overrideId);
      res.json({ success: true });
    } catch (err) {
      console.error("Erro ao remover override:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Get access audit logs
  app.get("/api/organizations/:id/access/logs", isAuthenticated, requireOrgAccess("id", "audit_logs:view"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const limit = Number(req.query.limit) || 100;
      const logs = await storage.getAccessLogs(orgId, limit);
      res.json(logs);
    } catch (err) {
      console.error("Erro ao buscar logs de acesso:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Get viewable surveys for current user (for viewer portal) - with progress data
  app.get("/api/organizations/:id/viewable-surveys", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = Number(req.params.id);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      
      // Interviewers only see assigned surveys
      if (isInterviewerRole(role)) {
        const assignedSurveys = await storage.getAssignedSurveys(userId, orgId);
        return res.json(assignedSurveys.filter(s => s.status === 'active'));
      }
      
      // Viewers and others with surveys:view can see all active/completed surveys with progress
      if (hasPermission(role, "surveys:view")) {
        const allSurveys = await storage.getSurveys(orgId);
        const viewableSurveys = allSurveys.filter(s => 
          s.status === 'active' || s.status === 'completed' || s.status === 'paused'
        );
        
        // Add response counts for each survey
        const surveysWithProgress = await Promise.all(viewableSurveys.map(async (survey) => {
          const analytics = await storage.getSurveyAnalytics(survey.id);
          return {
            ...survey,
            totalResponses: analytics.totalResponses,
            validResponses: analytics.validResponses,
            progress: survey.targetSample ? Math.min(100, Math.round((analytics.validResponses / survey.targetSample) * 100)) : 0
          };
        }));
        
        return res.json(surveysWithProgress);
      }
      
      res.json([]);
    } catch (err) {
      console.error("Erro ao buscar pesquisas visíveis:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // === QUESTION MODULES CRUD ===

  // List question modules for organization
  app.get("/api/organizations/:id/question-modules", isAuthenticated, requireOrgAccess("id", "surveys:view"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const modules = await storage.getQuestionModules(orgId);
      res.json(modules);
    } catch (err) {
      console.error("Erro ao buscar módulos:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Get a single question module
  app.get("/api/organizations/:id/question-modules/:moduleId", isAuthenticated, requireOrgAccess("id", "surveys:view"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const moduleId = Number(req.params.moduleId);
      const module = await storage.getQuestionModule(moduleId);
      
      if (!module || module.organizationId !== orgId) {
        return res.status(404).json({ message: "Módulo não encontrado" });
      }
      
      res.json(module);
    } catch (err) {
      console.error("Erro ao buscar módulo:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Create question module
  app.post("/api/organizations/:id/question-modules", isAuthenticated, requireOrgAccess("id", "surveys:edit"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const { name, description, questions } = req.body;
      
      if (!name || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Nome e perguntas são obrigatórios" });
      }
      
      const module = await storage.createQuestionModule({
        organizationId: orgId,
        name,
        description: description || null,
        questions,
        isDefault: false
      });
      
      res.status(201).json(module);
    } catch (err) {
      console.error("Erro ao criar módulo:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Update question module
  app.patch("/api/organizations/:id/question-modules/:moduleId", isAuthenticated, requireOrgAccess("id", "surveys:edit"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const moduleId = Number(req.params.moduleId);
      
      const existingModule = await storage.getQuestionModule(moduleId);
      if (!existingModule || existingModule.organizationId !== orgId) {
        return res.status(404).json({ message: "Módulo não encontrado" });
      }
      
      const { name, description, questions } = req.body;
      const module = await storage.updateQuestionModule(moduleId, {
        name: name ?? existingModule.name,
        description: description ?? existingModule.description,
        questions: questions ?? existingModule.questions
      });
      
      res.json(module);
    } catch (err) {
      console.error("Erro ao atualizar módulo:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Delete question module
  app.delete("/api/organizations/:id/question-modules/:moduleId", isAuthenticated, requireOrgAccess("id", "surveys:edit"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      const moduleId = Number(req.params.moduleId);
      
      const existingModule = await storage.getQuestionModule(moduleId);
      if (!existingModule || existingModule.organizationId !== orgId) {
        return res.status(404).json({ message: "Módulo não encontrado" });
      }
      
      await storage.deleteQuestionModule(moduleId);
      res.json({ success: true });
    } catch (err) {
      console.error("Erro ao deletar módulo:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Seed default question modules for organization (idempotent - skips if modules exist)
  app.post("/api/organizations/:id/question-modules/seed-defaults", isAuthenticated, requireOrgAccess("id", "surveys:edit"), async (req, res) => {
    try {
      const orgId = req.orgMember!.organizationId;
      
      // Check if default modules already exist for this org
      const existingModules = await storage.getQuestionModules(orgId);
      const hasDefaults = existingModules.some((m: any) => m.isDefault);
      if (hasDefaults) {
        return res.status(200).json({ message: "Modulos padrao ja existem", modules: existingModules.filter((m: any) => m.isDefault) });
      }
      
      const defaultModules = [
        {
          name: "Dados Demograficos - Idade",
          description: "Pergunta sobre faixa etaria do entrevistado",
          questions: [{
            text: "Qual a sua faixa etaria?",
            type: "multiple_choice",
            options: ["16 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 54 anos", "55 a 64 anos", "65 anos ou mais"],
            required: true
          }]
        },
        {
          name: "Dados Demograficos - Sexo",
          description: "Pergunta sobre genero do entrevistado",
          questions: [{
            text: "Qual o seu sexo?",
            type: "multiple_choice",
            options: ["Masculino", "Feminino", "Outro", "Prefiro nao informar"],
            required: true
          }]
        },
        {
          name: "Dados Demograficos - Escolaridade",
          description: "Pergunta sobre nivel de escolaridade",
          questions: [{
            text: "Qual o seu nivel de escolaridade?",
            type: "multiple_choice",
            options: ["Ensino Fundamental Incompleto", "Ensino Fundamental Completo", "Ensino Medio Incompleto", "Ensino Medio Completo", "Superior Incompleto", "Superior Completo", "Pos-graduacao"],
            required: true
          }]
        },
        {
          name: "Dados Demograficos - Religiao",
          description: "Pergunta sobre religiao do entrevistado",
          questions: [{
            text: "Qual a sua religiao?",
            type: "multiple_choice",
            options: ["Catolica", "Evangelica/Protestante", "Espirita", "Umbanda/Candomble", "Outra", "Sem religiao", "Prefiro nao informar"],
            required: true
          }]
        },
        {
          name: "Dados Demograficos - Renda",
          description: "Pergunta sobre renda familiar",
          questions: [{
            text: "Qual a renda mensal da sua familia?",
            type: "multiple_choice",
            options: ["Ate 1 salario minimo", "De 1 a 2 salarios minimos", "De 2 a 4 salarios minimos", "De 4 a 10 salarios minimos", "Mais de 10 salarios minimos", "Prefiro nao informar"],
            required: true
          }]
        },
        {
          name: "Dados Demograficos - Profissao",
          description: "Pergunta sobre situacao profissional",
          questions: [{
            text: "Qual a sua situacao profissional atual?",
            type: "multiple_choice",
            options: ["Empregado CLT", "Servidor Publico", "Autonomo/PJ", "Empresario", "Aposentado", "Estudante", "Desempregado", "Do lar", "Outro"],
            required: true
          }]
        },
        {
          name: "Dados Demograficos Completo",
          description: "Modulo completo com idade, sexo, escolaridade, renda e religiao",
          questions: [
            { text: "Qual a sua faixa etaria?", type: "multiple_choice", options: ["16 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 54 anos", "55 a 64 anos", "65 anos ou mais"], required: true },
            { text: "Qual o seu sexo?", type: "multiple_choice", options: ["Masculino", "Feminino", "Outro"], required: true },
            { text: "Qual o seu nivel de escolaridade?", type: "multiple_choice", options: ["Ensino Fundamental Incompleto", "Ensino Fundamental Completo", "Ensino Medio Incompleto", "Ensino Medio Completo", "Superior Incompleto", "Superior Completo", "Pos-graduacao"], required: true },
            { text: "Qual a renda mensal da sua familia?", type: "multiple_choice", options: ["Ate 1 salario minimo", "De 1 a 2 salarios minimos", "De 2 a 4 salarios minimos", "De 4 a 10 salarios minimos", "Mais de 10 salarios minimos"], required: true },
            { text: "Qual a sua religiao?", type: "multiple_choice", options: ["Catolica", "Evangelica/Protestante", "Espirita", "Outra", "Sem religiao"], required: true }
          ]
        }
      ];
      
      const createdModules = [];
      for (const mod of defaultModules) {
        const created = await storage.createQuestionModule({
          organizationId: orgId,
          name: mod.name,
          description: mod.description,
          questions: mod.questions,
          isDefault: true
        });
        createdModules.push(created);
      }
      
      res.status(201).json({ message: `${createdModules.length} modulos padrao criados`, modules: createdModules });
    } catch (err) {
      console.error("Erro ao criar modulos padrao:", err);
      res.status(500).json({ message: "Erro interno" });
    }
  });

  // Subscription Plans - Public endpoint for landing page
  app.get("/api/plans", async (_req, res) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      res.json(plans);
    } catch (err) {
      res.status(500).json({ message: "Erro ao buscar planos" });
    }
  });

  // Check if current user is a platform admin
  // Admin emails are stored in PLATFORM_ADMIN_EMAILS env var (comma-separated)
  const getPlatformAdminEmails = (): string[] => {
    const envEmails = process.env.PLATFORM_ADMIN_EMAILS || '';
    return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  };

  app.get("/api/admin/check", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const user = await storage.getUserById(userId);
      const platformAdminEmails = getPlatformAdminEmails();
      console.log('[admin/check] userId:', userId, 'email:', user?.email, 'adminEmails:', platformAdminEmails);
      const isAdmin = user && user.email && platformAdminEmails.includes(user.email.toLowerCase());
      console.log('[admin/check] isAdmin:', isAdmin);
      res.json({ isAdmin });
    } catch (err) {
      console.error('[admin/check] error:', err);
      res.json({ isAdmin: false });
    }
  });

  // Subscription Plans - Admin endpoint to update plan
  const platformAdminSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    priceMonthly: z.number().int().min(0).optional(),
    priceYearly: z.number().int().min(0).optional(),
    maxSurveys: z.number().int().optional(),
    maxInterviews: z.number().int().optional(),
    maxUsers: z.number().int().optional(),
    features: z.array(z.string()).optional()
  });

  app.patch("/api/plans/:planId", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const user = await storage.getUserById(userId);
      
      const platformAdminEmails = getPlatformAdminEmails();
      if (!user || !user.email || !platformAdminEmails.includes(user.email.toLowerCase())) {
        return res.status(403).json({ message: "Apenas administradores da plataforma podem editar planos" });
      }

      const planId = req.params.planId;
      const validatedData = platformAdminSchema.parse(req.body);
      const updated = await storage.updateSubscriptionPlan(planId, validatedData);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar plano" });
    }
  });

  // Platform Admin - List all organizations with their plans
  app.get("/api/admin/organizations", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const user = await storage.getUserById(userId);
      
      const platformAdminEmails = getPlatformAdminEmails();
      if (!user || !user.email || !platformAdminEmails.includes(user.email.toLowerCase())) {
        return res.status(403).json({ message: "Apenas administradores da plataforma" });
      }

      const orgs = await storage.getOrganizations();
      res.json(orgs);
    } catch (err) {
      console.error('[admin/organizations] error:', err);
      res.status(500).json({ message: "Erro ao listar organizações" });
    }
  });

  // Platform Admin - Change organization plan
  app.patch("/api/admin/organizations/:orgId/plan", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const user = await storage.getUserById(userId);
      
      const platformAdminEmails = getPlatformAdminEmails();
      if (!user || !user.email || !platformAdminEmails.includes(user.email.toLowerCase())) {
        return res.status(403).json({ message: "Apenas administradores da plataforma" });
      }

      const orgId = parseInt(req.params.orgId);
      const { plan } = z.object({ plan: z.enum(['basic', 'pro', 'enterprise']) }).parse(req.body);
      
      // Get plan limits from subscription_plans table
      const plans = await storage.getSubscriptionPlans();
      const selectedPlan = plans.find(p => p.id === plan && p.isActive);
      
      if (!selectedPlan) {
        return res.status(400).json({ message: "Plano não encontrado ou inativo" });
      }
      
      // Only update limits if they are defined in the plan
      const updateData: Record<string, any> = { plan };
      if (selectedPlan.maxSurveys !== null && selectedPlan.maxSurveys !== undefined) {
        updateData.maxSurveys = selectedPlan.maxSurveys;
      }
      if (selectedPlan.maxInterviews !== null && selectedPlan.maxInterviews !== undefined) {
        updateData.maxInterviews = selectedPlan.maxInterviews;
      }
      if (selectedPlan.maxUsers !== null && selectedPlan.maxUsers !== undefined) {
        updateData.maxUsers = selectedPlan.maxUsers;
      }
      
      const updated = await storage.updateOrganization(orgId, updateData);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error('[admin/organizations/plan] error:', err);
      res.status(500).json({ message: "Erro ao atualizar plano da organização" });
    }
  });

  // Platform Admin - List all users
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const user = await storage.getUserById(userId);
      
      const platformAdminEmails = getPlatformAdminEmails();
      if (!user || !user.email || !platformAdminEmails.includes(user.email.toLowerCase())) {
        return res.status(403).json({ message: "Apenas administradores da plataforma" });
      }

      const allUsers = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        authProvider: users.authProvider,
        hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      }).from(users).orderBy(users.email);
      
      res.json(allUsers);
    } catch (err) {
      console.error('[admin/users] error:', err);
      res.status(500).json({ message: "Erro ao listar usuários" });
    }
  });

  // Platform Admin - Reset user password
  app.post("/api/admin/users/:userId/reset-password", isAuthenticated, async (req, res) => {
    try {
      const adminUserId = getUserId(req);
      const adminUser = await storage.getUserById(adminUserId);
      
      const platformAdminEmails = getPlatformAdminEmails();
      if (!adminUser || !adminUser.email || !platformAdminEmails.includes(adminUser.email.toLowerCase())) {
        return res.status(403).json({ message: "Apenas administradores da plataforma" });
      }

      const targetUserId = req.params.userId;
      const { password } = z.object({ 
        password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres") 
      }).parse(req.body);
      
      const updatedUser = await authService.setUserPasswordByAdmin(targetUserId, password);
      
      res.json({ 
        success: true, 
        message: "Senha atualizada com sucesso",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          authProvider: updatedUser.authProvider
        }
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error('[admin/users/reset-password] error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : "Erro ao redefinir senha" });
    }
  });

  // Supervisor Dashboard - Real-time overview
  app.get("/api/organizations/:id/supervisor/overview", isAuthenticated, requireOrgAccess("id", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const overview = await storage.getSupervisorOverview(orgId);
      res.json(overview);
    } catch (err) {
      console.error('[supervisor/overview] error:', err);
      res.status(500).json({ message: "Erro ao carregar visão geral do supervisor" });
    }
  });

  // ==========================================
  // REAL-TIME INTERVIEWER TRACKING
  // ==========================================

  // Report location (interviewer sends this periodically)
  app.post("/api/organizations/:id/tracking/location", isAuthenticated, requireOrgAccess("id", "responses:submit"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const userId = await getResolvedUserId(req);
      
      const input = z.object({
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number().optional().nullable(),
        speed: z.number().optional().nullable(),
        heading: z.number().optional().nullable(),
        surveyId: z.number().optional().nullable(),
        sessionId: z.string().optional().nullable()
      }).parse(req.body);

      const MAX_ACCURACY_THRESHOLD = 5000;
      if (input.accuracy != null && input.accuracy > MAX_ACCURACY_THRESHOLD) {
        return res.json({ success: true, skipped: true, reason: 'low_accuracy' });
      }

      await db.insert(interviewerLocations).values({
        organizationId: orgId,
        userId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy ?? 10,
        speed: input.speed ?? undefined,
        heading: input.heading ?? undefined,
        surveyId: input.surveyId ?? undefined,
        sessionId: input.sessionId ?? undefined,
        isOnline: true
      });

      // Update daily distance in background
      updateDailyDistanceSummary(orgId, userId, input.surveyId || null, new Date()).catch(console.error);

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error('[tracking/location] error:', err);
      res.status(500).json({ message: "Erro ao registrar localização" });
    }
  });

  // Get interviewer's route for a specific day
  app.get("/api/organizations/:id/tracking/route/:userId", isAuthenticated, requireOrgAccess("id", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const dateParam = req.query.date as string;
      const surveyId = req.query.surveyId ? parseInt(req.query.surveyId as string) : undefined;
      
      const date = dateParam ? new Date(dateParam) : new Date();
      
      const route = await getRouteForDay(orgId, targetUserId, date, surveyId);
      res.json(route);
    } catch (err) {
      console.error('[tracking/route] error:', err);
      res.status(500).json({ message: "Erro ao carregar rota" });
    }
  });

  // Get interviewer's distance statistics
  app.get("/api/organizations/:id/tracking/distance/:userId", isAuthenticated, requireOrgAccess("id", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const surveyId = req.query.surveyId ? parseInt(req.query.surveyId as string) : undefined;
      
      const stats = await getTotalSurveyDistance(orgId, targetUserId, surveyId);
      
      res.json({
        totalMeters: stats.totalMeters,
        totalFormatted: formatDistance(stats.totalMeters),
        byDay: stats.byDay.map(d => ({
          date: d.date,
          meters: d.meters,
          formatted: formatDistance(d.meters)
        }))
      });
    } catch (err) {
      console.error('[tracking/distance] error:', err);
      res.status(500).json({ message: "Erro ao carregar estatísticas de distância" });
    }
  });

  // Get all interviewers with real-time locations
  app.get("/api/organizations/:id/tracking/interviewers", isAuthenticated, requireOrgAccess("id", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const interviewersData = await storage.getInterviewersWithRealtimeLocation(orgId);
      res.json(interviewersData);
    } catch (err) {
      console.error('[tracking/interviewers] error:', err);
      res.status(500).json({ message: "Erro ao carregar entrevistadores" });
    }
  });

  // Heartbeat to keep interviewer online (dashboard presence)
  app.post("/api/organizations/:id/tracking/heartbeat", isAuthenticated, requireOrgAccess("id", "responses:submit"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const userId = await getResolvedUserId(req);
      
      const now = new Date();
      
      const existingLocation = await db.select()
        .from(interviewerLocations)
        .where(and(
          eq(interviewerLocations.userId, userId),
          eq(interviewerLocations.organizationId, orgId)
        ))
        .orderBy(desc(interviewerLocations.recordedAt))
        .limit(1);
      
      if (existingLocation.length > 0) {
        await db.update(interviewerLocations)
          .set({ 
            isOnline: true,
            recordedAt: now  // Update recordedAt so online threshold check works
          })
          .where(eq(interviewerLocations.id, existingLocation[0].id));
      }
      // If no existing location row exists, do NOT insert a 0,0 placeholder.
      // The location will be properly set when the first GPS ping arrives.
      
      res.json({ success: true });
    } catch (err) {
      console.error('[tracking/heartbeat] error:', err);
      res.status(500).json({ message: "Erro ao enviar heartbeat" });
    }
  });

  // Set interviewer offline (when they close the app)
  app.post("/api/organizations/:id/tracking/offline", isAuthenticated, requireOrgAccess("id", "responses:submit"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const userId = await getResolvedUserId(req);
      
      // Mark last location as offline — scoped to this org only
      await db.update(interviewerLocations)
        .set({ isOnline: false })
        .where(and(
          eq(interviewerLocations.userId, userId),
          eq(interviewerLocations.organizationId, orgId)
        ));
      
      res.json({ success: true });
    } catch (err) {
      console.error('[tracking/offline] error:', err);
      res.status(500).json({ message: "Erro ao atualizar status" });
    }
  });

  // ==========================================
  // PLATFORM ADMIN - SUPER ADMIN PANEL
  // ==========================================

  // Helper to check if user is platform admin
  const requirePlatformAdmin = async (req: any, res: any, next: any) => {
    try {
      const userId = await getResolvedUserId(req);
      const user = await storage.getUserById(userId);
      const platformAdminEmails = getPlatformAdminEmails();
      
      if (!user || !user.email || !platformAdminEmails.includes(user.email.toLowerCase())) {
        return res.status(403).json({ message: "Apenas administradores da plataforma podem acessar este recurso" });
      }
      next();
    } catch (err) {
      return res.status(403).json({ message: "Erro de autenticação" });
    }
  };

  // List all organizations (platform admin only)
  app.get("/api/platform/organizations", isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const orgs = await storage.listAllOrganizations();
      res.json(orgs);
    } catch (err) {
      console.error('[platform/organizations] error:', err);
      res.status(500).json({ message: "Erro ao listar organizações" });
    }
  });

  // Create organization (platform admin only)
  app.post("/api/platform/organizations", isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const input = z.object({
        name: z.string().min(2),
        slug: z.string().min(2).optional(),
        ownerEmail: z.string().email(),
        planType: z.enum(['basic', 'pro', 'enterprise']).default('basic')
      }).parse(req.body);
      
      const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      
      // Check if owner user exists or create
      let ownerUser = await storage.getUserByEmail(input.ownerEmail);
      if (!ownerUser) {
        ownerUser = await storage.createUserByEmail(input.ownerEmail);
      }
      
      const org = await storage.createOrganization({ 
        name: input.name, 
        slug,
        plan: input.planType
      });
      
      // Add owner as member
      await storage.addMember({
        organizationId: org.id,
        userId: ownerUser.id,
        role: 'owner'
      });
      
      res.status(201).json({ ...org, ownerEmail: input.ownerEmail, memberCount: 1 });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error('[platform/organizations/create] error:', err);
      res.status(500).json({ message: "Erro ao criar organização" });
    }
  });

  // Delete organization (platform admin only) - HARD DELETE
  app.delete("/api/platform/organizations/:id", isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const org = await storage.getOrganization(orgId);
      
      if (!org) {
        return res.status(404).json({ message: "Organização não encontrada" });
      }
      
      await storage.deleteOrganizationHard(orgId);
      res.json({ success: true, message: `Organização "${org.name}" excluída permanentemente` });
    } catch (err) {
      console.error('[platform/organizations/delete] error:', err);
      res.status(500).json({ message: "Erro ao excluir organização" });
    }
  });

  // List all users with memberships (platform admin only)
  app.get("/api/platform/users", isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const usersWithMemberships = await storage.listAllUsersWithMemberships();
      res.json(usersWithMemberships);
    } catch (err) {
      console.error('[platform/users] error:', err);
      res.status(500).json({ message: "Erro ao listar usuários" });
    }
  });

  // Delete user from platform (platform admin only)
  app.delete("/api/platform/users/:userId", isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      const user = await storage.getUserById(targetUserId);
      
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      // Cascade delete all user dependencies in correct order
      // 1. Remove organization memberships
      await db.delete(organizationMembers).where(eq(organizationMembers.userId, targetUserId));
      
      // 2. Remove pending invitations created by this user
      await db.delete(pendingInvitations).where(eq(pendingInvitations.invitedBy, targetUserId));
      
      // 3. Remove survey assignments where user is interviewer or assigner
      await db.delete(surveyAssignments).where(eq(surveyAssignments.interviewerId, targetUserId));
      await db.delete(surveyAssignments).where(eq(surveyAssignments.assignedBy, targetUserId));
      
      // 4. Remove coordinator assignments
      await db.delete(surveyCoordinators).where(eq(surveyCoordinators.coordinatorId, targetUserId));
      await db.delete(surveyCoordinators).where(eq(surveyCoordinators.assignedBy, targetUserId));
      
      // 4b. Remove viewer assignments
      await db.delete(surveyViewers).where(eq(surveyViewers.viewerId, targetUserId));
      await db.delete(surveyViewers).where(eq(surveyViewers.assignedBy, targetUserId));
      
      // 5. Set NULL for responses (preserve data for audit)
      await db.update(responses).set({ interviewerId: null as any }).where(eq(responses.interviewerId, targetUserId));
      
      // 6. Set NULL for surveys deleted by this user
      await db.update(surveys).set({ deletedBy: null }).where(eq(surveys.deletedBy, targetUserId));
      
      // 7. Remove verification tokens
      await db.delete(verificationTokens).where(eq(verificationTokens.userId, targetUserId));
      
      // 9. Remove sessions
      await db.execute(sql`DELETE FROM sessions WHERE sess::jsonb->>'userId' = ${targetUserId}`);
      
      // 10. Finally delete the user
      await db.delete(users).where(eq(users.id, targetUserId));
      
      res.json({ success: true, message: `Usuário "${user.email}" excluído permanentemente` });
    } catch (err) {
      console.error('[platform/users/delete] error:', err);
      res.status(500).json({ message: "Erro ao excluir usuário" });
    }
  });

  // Add user to organization (platform admin only)
  app.post("/api/platform/organizations/:id/members", isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const orgId = parseInt(req.params.id);
      const input = z.object({
        email: z.string().email(),
        role: z.enum(['owner', 'admin', 'coordinator', 'interviewer', 'viewer'])
      }).parse(req.body);
      
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: "Organização não encontrada" });
      }
      
      // Check if user exists or create
      let user = await storage.getUserByEmail(input.email);
      if (!user) {
        user = await storage.createUserByEmail(input.email);
      }
      
      // Check if already member
      const existingMember = await storage.getMemberByUserId(user.id, orgId);
      if (existingMember) {
        return res.status(400).json({ message: "Usuário já é membro desta organização" });
      }
      
      const member = await storage.addMember({
        organizationId: orgId,
        userId: user.id,
        role: input.role
      });
      
      res.status(201).json({ ...member, user });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error('[platform/organizations/members/add] error:', err);
      res.status(500).json({ message: "Erro ao adicionar membro" });
    }
  });

  // === LANDING PAGE CMS ===
  
  // Get landing page config (public, for landing page)
  app.get("/api/landing-config", async (req, res) => {
    try {
      const config = await storage.getLandingPageConfig();
      res.json(config || {});
    } catch (err) {
      console.error('[landing-config/get] error:', err);
      res.status(500).json({ message: "Erro ao buscar configurações" });
    }
  });

  // Update landing page config (platform admin only)
  app.put("/api/landing-config", isAuthenticated, requirePlatformAdmin, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const updated = await storage.upsertLandingPageConfig(req.body, userId);
      res.json(updated);
    } catch (err) {
      console.error('[landing-config/update] error:', err);
      res.status(500).json({ message: "Erro ao salvar configurações" });
    }
  });

  // === INTERVIEWER ANALYTICS ===
  const { 
    getIndividualInterviewerMetrics, 
    getSupervisorDashboardMetrics, 
    getInterviewerTrend,
    getInterviewerSurveyOptions 
  } = await import("./services/interviewer-analytics");

  // Individual interviewer metrics (for interviewer's own dashboard)
  app.get("/api/analytics/my-performance", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = parseInt(req.query.orgId as string);
      const surveyId = req.query.surveyId ? parseInt(req.query.surveyId as string) : undefined;

      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ message: "orgId é obrigatório" });
      }

      const isMember = await storage.isUserMemberOfOrg(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const metrics = await getIndividualInterviewerMetrics(userId, orgId, surveyId);
      res.json(metrics);
    } catch (err) {
      console.error('[analytics/my-performance] error:', err);
      res.status(500).json({ message: "Erro ao buscar métricas" });
    }
  });

  // Supervisor dashboard metrics (for coordinators/admins)
  app.get("/api/organizations/:orgId/analytics/interviewers", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    console.log('[analytics/interviewers] Request received for org:', req.params.orgId);
    try {
      const orgId = parseInt(req.params.orgId);
      const userId = await getResolvedUserId(req);
      const member = await storage.getMemberByUserId(userId, orgId);

      if (!member || !canViewAnalytics(member.role as UserRole)) {
        return res.status(403).json({ message: "Sem permissão para ver analytics" });
      }

      const surveyId = req.query.surveyId ? parseInt(req.query.surveyId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const metrics = await getSupervisorDashboardMetrics(orgId, { surveyId, startDate, endDate });
      res.json(metrics);
    } catch (err) {
      console.error('[analytics/interviewers] error:', err);
      res.status(500).json({ message: "Erro ao buscar métricas" });
    }
  });

  // Trend data for charts
  app.get("/api/organizations/:orgId/analytics/trend", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const userId = await getResolvedUserId(req);
      const member = await storage.getMemberByUserId(userId, orgId);

      if (!member || !canViewAnalytics(member.role as UserRole)) {
        return res.status(403).json({ message: "Sem permissão para ver analytics" });
      }

      const surveyId = req.query.surveyId ? parseInt(req.query.surveyId as string) : undefined;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;

      const trend = await getInterviewerTrend(orgId, { surveyId, days });
      res.json(trend);
    } catch (err) {
      console.error('[analytics/trend] error:', err);
      res.status(500).json({ message: "Erro ao buscar tendência" });
    }
  });

  // T012: State municipality map — aggregate leading candidate % per geofenceCity
  app.get("/api/organizations/:orgId/state-map-data", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const surveysRows = await db.execute(sql`
        SELECT s.id, s.title, s.geofence_city, s.target_sample, s.status,
               COUNT(r.id) FILTER (WHERE r.status != 'invalid') as response_count
        FROM surveys s
        LEFT JOIN responses r ON r.survey_id = s.id
        WHERE s.organization_id = ${orgId}
        GROUP BY s.id
      `);

      const cityData: Record<string, {
        city: string; surveys: Array<{ id: number; title: string; status: string; responses: number; target: number }>;
        leadingOption: string | null; leadingPct: number;
      }> = {};

      for (const row of surveysRows.rows as any[]) {
        const city = row.geofence_city;
        if (!city) continue;

        if (!cityData[city]) {
          cityData[city] = { city, surveys: [], leadingOption: null, leadingPct: 0 };
        }

        cityData[city].surveys.push({
          id: row.id, title: row.title, status: row.status,
          responses: parseInt(row.response_count || '0'), target: row.target_sample || 0,
        });

        // Get vote intention for this survey
        const voteRows = await db.execute(sql`
          SELECT ra.value, COUNT(*) as cnt
          FROM responses r
          JOIN answers ra ON ra.response_id = r.id
          JOIN questions q ON q.id = ra.question_id
          WHERE r.survey_id = ${row.id}
            AND r.status != 'invalid'
            AND q.is_vote_intention = true
          GROUP BY ra.value
          ORDER BY cnt DESC
          LIMIT 1
        `);

        if (voteRows.rows.length > 0) {
          const top = voteRows.rows[0] as any;
          const tvResult = await db.execute(sql`
            SELECT COUNT(*) as cnt FROM responses r
            JOIN answers ra ON ra.response_id = r.id
            JOIN questions q ON q.id = ra.question_id
            WHERE r.survey_id = ${row.id} AND r.status != 'invalid' AND q.is_vote_intention = true
          `);
          const totalVotes = parseInt((tvResult.rows[0] as any)?.cnt || '1');

          const pct = Math.round((parseInt(top.cnt) / totalVotes) * 100);
          if (pct > cityData[city].leadingPct) {
            cityData[city].leadingOption = top.value;
            cityData[city].leadingPct = pct;
          }
        }
      }

      res.json(Object.values(cityData));
    } catch (err) {
      console.error('[state-map-data] error:', err);
      res.status(500).json({ message: "Erro ao buscar dados do mapa" });
    }
  });

  // --- TEST WHATSAPP ---
  app.post("/api/organizations/:orgId/test-whatsapp", isAuthenticated, requireOrgAccess("orgId", "org:manage"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const org = await storage.getOrganization(orgId);
      if (!org?.whatsappPhone) {
        return res.status(400).json({ message: "Nenhum número de WhatsApp configurado para esta organização." });
      }
      console.log('[WhatsApp/test] Attempting to send test message to', org.whatsappPhone);
      const ok = await sendWhatsAppMessage(
        org.whatsappPhone,
        `✅ *Teste VotoAudit*\nConexão com WhatsApp funcionando corretamente!\nOrganização: ${org.name}`
      );
      if (ok) {
        res.json({ success: true, message: "Mensagem de teste enviada com sucesso!" });
      } else {
        res.status(500).json({ success: false, message: "Falha ao enviar mensagem. Verifique os logs do servidor." });
      }
    } catch (err) {
      console.error('[WhatsApp/test] error:', err);
      res.status(500).json({ message: "Erro ao enviar mensagem de teste" });
    }
  });

  // --- GEOFENCE VIOLATIONS ---
  // POST: record a geofence violation from an interviewer
  app.post("/api/surveys/:surveyId/geofence-violations", isAuthenticated, async (req, res) => {
    try {
      const surveyId = parseInt(req.params.surveyId);
      const userId = await getResolvedUserId(req);
      const { latitude, longitude, neighborhood } = req.body;

      if (!neighborhood) return res.status(400).json({ message: "neighborhood required" });

      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Survey not found" });

      const membership = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!membership) return res.status(403).json({ message: "Acesso negado" });

      const fieldRoles = ["owner", "admin", "coordinator"];
      if (!fieldRoles.includes(membership.role)) {
        const assigned = await storage.isInterviewerAssigned(surveyId, userId);
        if (!assigned) return res.status(403).json({ message: "Acesso negado" });
      }

      const violation = await storage.createGeofenceViolation({
        surveyId,
        organizationId: survey.organizationId,
        interviewerId: userId,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        neighborhood,
      });

      // Send push notifications to subscribed admins/coordinators
      const interviewer = await storage.getUserById(userId);
      const interviewerName = [interviewer?.firstName, interviewer?.lastName].filter(Boolean).join(' ') || 'Entrevistadora';

      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        try {
          const subscriptions = await storage.getOrgPushSubscriptions(survey.organizationId);
          const payload = JSON.stringify({
            title: '⚠️ Saída de Setor Detectada',
            body: `${interviewerName} saiu do bairro ${neighborhood} (${survey.title})`,
            icon: '/icon-192.svg',
            badge: '/icon-192.svg',
            data: { surveyId, orgId: survey.organizationId, url: `/org/${survey.organizationId}/geofencing` }
          });
          await Promise.allSettled(
            subscriptions.map(s => webpush.sendNotification(s.subscription as webpush.PushSubscription, payload))
          );
        } catch (pushErr) {
          console.error('[geofence-violations/push] error:', pushErr);
        }
      }

      // T010: WhatsApp alert for geofence violation
      try {
        const org = await storage.getOrganization(survey.organizationId);
        if (org?.whatsappPhone) {
          const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          await sendWhatsAppMessage(
            org.whatsappPhone,
            `⚠️ *Saída de Geocerca* [${time}]\n` +
            `Entrevistadora: *${interviewerName}*\n` +
            `Saiu do bairro: *${neighborhood}*\n` +
            `Pesquisa: ${survey.title}`
          );
        }
      } catch (waErr) {
        console.error('[geofence-violations/whatsapp] error:', waErr);
      }

      res.status(201).json(violation);
    } catch (err) {
      console.error('[geofence-violations/create] error:', err);
      res.status(500).json({ message: "Erro ao registrar violação" });
    }
  });

  // GET: fetch the current user's assigned zones (with polygons) for a survey
  app.get("/api/surveys/:surveyId/my-zones", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const surveyId = parseInt(req.params.surveyId);
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      const orgId = survey.organizationId;
      // Get zone assignments for this interviewer + survey
      const assignments = await storage.getZoneAssignments(orgId, surveyId);
      const myAssignments = assignments.filter((a: any) => a.interviewerId === userId);
      if (myAssignments.length === 0) return res.json([]);
      // Get custom geofences to match polygons by name
      const orgGeofences = await storage.getCustomGeofences(orgId);
      const zones = myAssignments.map((a: any) => {
        const fence = orgGeofences.find((f: any) => f.name === a.neighborhood);
        return { neighborhood: a.neighborhood, polygon: fence?.polygon || null, populationCount: fence?.populationCount || null };
      });
      res.json(zones);
    } catch (err) {
      res.status(500).json({ message: "Erro ao buscar zonas" });
    }
  });

  // GET: fetch geofence violations for an org (supervisor/admin view)
  app.get("/api/organizations/:orgId/geofence-violations", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      const violations = await storage.getGeofenceViolations(orgId, since);
      res.json(violations);
    } catch (err) {
      console.error('[geofence-violations/list] error:', err);
      res.status(500).json({ message: "Erro ao buscar violações" });
    }
  });

  // --- CUSTOM GEOFENCES ---
  app.get("/api/organizations/:orgId/custom-geofences", isAuthenticated, requireOrgAccess("orgId", "surveys:view"), async (req, res) => {
    const orgId = parseInt(req.params.orgId);
    const geofences = await storage.getCustomGeofences(orgId);
    res.json(geofences);
  });

  app.post("/api/organizations/:orgId/custom-geofences", isAuthenticated, requireOrgAccess("orgId", "surveys:edit"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const { name, city, polygon, populationCount } = req.body;
      if (!name?.trim() || !polygon?.length) {
        return res.status(400).json({ message: "Nome e polígono são obrigatórios" });
      }
      const geofence = await storage.createCustomGeofence({
        organizationId: orgId,
        name: name.trim(),
        city: city?.trim() || null,
        polygon,
        populationCount: populationCount ? parseInt(populationCount) : null,
      });
      res.status(201).json(geofence);
    } catch (err) {
      console.error('[custom-geofences/create] error:', err);
      res.status(500).json({ message: "Erro ao criar geocerca" });
    }
  });

  app.patch("/api/organizations/:orgId/custom-geofences/:id", isAuthenticated, requireOrgAccess("orgId", "surveys:edit"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const orgId = parseInt(req.params.orgId);
      const { name, city, polygon, populationCount } = req.body;
      const geofence = await storage.updateCustomGeofence(id, orgId, {
        name, city, polygon,
        populationCount: populationCount !== undefined ? (populationCount ? parseInt(populationCount) : null) : undefined,
      });
      if (!geofence) return res.status(404).json({ message: "Geocerca não encontrada" });
      res.json(geofence);
    } catch (err) {
      res.status(500).json({ message: "Erro ao atualizar geocerca" });
    }
  });

  app.delete("/api/organizations/:orgId/custom-geofences/:id", isAuthenticated, requireOrgAccess("orgId", "surveys:edit"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const orgId = parseInt(req.params.orgId);
      const deleted = await storage.deleteCustomGeofence(id, orgId);
      if (!deleted) return res.status(404).json({ message: "Geocerca não encontrada" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Erro ao deletar geocerca" });
    }
  });

  // Replace all zone assignments for a specific interviewer+survey
  app.put("/api/organizations/:orgId/zone-assignments/bulk", isAuthenticated, requireOrgAccess("orgId", "surveys:edit"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const { surveyId, interviewerId, neighborhoods } = req.body;
      if (!surveyId || !interviewerId || !Array.isArray(neighborhoods)) {
        return res.status(400).json({ message: "surveyId, interviewerId e neighborhoods são obrigatórios" });
      }
      await storage.replaceZoneAssignments(orgId, surveyId, interviewerId, neighborhoods);
      res.json({ ok: true });
    } catch (err) {
      console.error('[zone-assignments/bulk] error:', err);
      res.status(500).json({ message: "Erro ao atualizar atribuições" });
    }
  });

  // --- CHAT MESSAGES ---
  // Helper: send push notification to a user if they have a subscription
  async function sendMessagePush(toUserId: string, fromName: string, content: string, orgId: number) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
    try {
      const sub = await storage.getUserPushSubscriptionByUser(toUserId);
      if (!sub) return;
      const payload = JSON.stringify({
        title: `💬 Mensagem de ${fromName}`,
        body: content.length > 100 ? content.slice(0, 100) + '…' : content,
        icon: '/icon-192.svg',
        badge: '/icon-192.svg',
        data: { url: `/org/${orgId}/messages` }
      });
      await webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload);
    } catch (err) {
      console.error('[messages/push] error:', err);
    }
  }

  // GET conversations list for current user in org
  app.get("/api/organizations/:orgId/messages", isAuthenticated, requireOrgAccess("orgId", "surveys:view"), async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = parseInt(req.params.orgId);
      const conversations = await storage.getConversationList(orgId, userId);
      res.json(conversations);
    } catch (err) {
      console.error('[messages/list] error:', err);
      res.status(500).json({ message: "Erro ao buscar conversas" });
    }
  });

  // GET conversation with specific user
  app.get("/api/organizations/:orgId/messages/:otherUserId", isAuthenticated, requireOrgAccess("orgId", "surveys:view"), async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = parseInt(req.params.orgId);
      const otherUserId = req.params.otherUserId;
      const msgs = await storage.getConversation(orgId, userId, otherUserId);
      // Mark received messages as read
      await storage.markMessagesRead(orgId, otherUserId, userId);
      res.json(msgs);
    } catch (err) {
      console.error('[messages/get] error:', err);
      res.status(500).json({ message: "Erro ao buscar mensagens" });
    }
  });

  // POST send message to user
  app.post("/api/organizations/:orgId/messages/:toUserId", isAuthenticated, requireOrgAccess("orgId", "surveys:view"), async (req, res) => {
    try {
      const fromUserId = await getResolvedUserId(req);
      const orgId = parseInt(req.params.orgId);
      const toUserId = req.params.toUserId;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ message: "Conteúdo obrigatório" });

      // Verify recipient is member of the org
      const isMember = await storage.isUserMemberOfOrg(toUserId, orgId);
      if (!isMember) return res.status(403).json({ message: "Destinatário não é membro desta organização" });

      const msg = await storage.sendMessage({ organizationId: orgId, fromUserId, toUserId, content: content.trim() });

      // Send push notification to recipient
      const fromUser = await storage.getUserById(fromUserId);
      const fromName = fromUser ? [fromUser.firstName, fromUser.lastName].filter(Boolean).join(' ') || fromUser.email || 'Alguém' : 'Alguém';
      await sendMessagePush(toUserId, fromName, content.trim(), orgId);

      res.status(201).json(msg);
    } catch (err) {
      console.error('[messages/send] error:', err);
      res.status(500).json({ message: "Erro ao enviar mensagem" });
    }
  });

  // GET unread message count for current user
  app.get("/api/messages/unread-count", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const count = await storage.getUnreadCount(userId);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ count: 0 });
    }
  });

  // --- PERSONAL PUSH SUBSCRIPTIONS (for message notifications) ---
  // Subscribe (any authenticated user)
  app.post("/api/push/personal/subscribe", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const { subscription } = req.body;
      if (!subscription) return res.status(400).json({ message: "subscription required" });
      await storage.saveUserPushSubscription(userId, subscription);
      res.json({ ok: true });
    } catch (err) {
      console.error('[push/personal/subscribe] error:', err);
      res.status(500).json({ message: "Erro ao salvar inscrição push" });
    }
  });

  // Unsubscribe
  app.delete("/api/push/personal/subscribe", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      await storage.deleteUserPushSubscription(userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Erro" });
    }
  });

  // Status
  app.get("/api/push/personal/status", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const sub = await storage.getUserPushSubscriptionByUser(userId);
      res.json({ subscribed: !!sub, publicKey: process.env.VAPID_PUBLIC_KEY || null });
    } catch (err) {
      res.status(500).json({ subscribed: false, publicKey: null });
    }
  });

  // --- PUSH SUBSCRIPTIONS ---
  // GET VAPID public key
  app.get("/api/push/vapid-public-key", isAuthenticated, (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  });

  // POST: subscribe to push notifications
  app.post("/api/organizations/:orgId/push/subscribe", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = parseInt(req.params.orgId);
      const { subscription } = req.body;
      if (!subscription) return res.status(400).json({ message: "subscription required" });
      const saved = await storage.savePushSubscription(userId, orgId, subscription);
      res.json({ ok: true, id: saved.id });
    } catch (err) {
      console.error('[push/subscribe] error:', err);
      res.status(500).json({ message: "Erro ao salvar inscrição push" });
    }
  });

  // DELETE: unsubscribe from push notifications
  app.delete("/api/organizations/:orgId/push/subscribe", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = parseInt(req.params.orgId);
      await storage.deletePushSubscription(userId, orgId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[push/unsubscribe] error:', err);
      res.status(500).json({ message: "Erro ao cancelar inscrição push" });
    }
  });

  // GET: check if current user has push subscription
  app.get("/api/organizations/:orgId/push/status", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const orgId = parseInt(req.params.orgId);
      const sub = await storage.getUserPushSubscription(userId, orgId);
      res.json({ subscribed: !!sub });
    } catch (err) {
      res.status(500).json({ message: "Erro" });
    }
  });

  // --- ZONE ASSIGNMENTS ---
  // GET zone assignments for an org (optionally filtered by survey)
  app.get("/api/organizations/:orgId/zone-assignments", isAuthenticated, requireOrgAccess("orgId", "analytics:view"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const surveyId = req.query.surveyId ? parseInt(req.query.surveyId as string) : undefined;
      const assignments = await storage.getZoneAssignments(orgId, surveyId);
      res.json(assignments);
    } catch (err) {
      console.error('[zone-assignments/list] error:', err);
      res.status(500).json({ message: "Erro ao buscar atribuições" });
    }
  });

  // POST: create/update zone assignment
  app.post("/api/organizations/:orgId/zone-assignments", isAuthenticated, requireOrgAccess("orgId", "surveys:manage"), async (req, res) => {
    try {
      const orgId = parseInt(req.params.orgId);
      const { surveyId, interviewerId, neighborhood } = req.body;
      if (!surveyId || !interviewerId || !neighborhood) {
        return res.status(400).json({ message: "surveyId, interviewerId e neighborhood são obrigatórios" });
      }
      const assignment = await storage.upsertZoneAssignment({ organizationId: orgId, surveyId, interviewerId, neighborhood });
      res.status(201).json(assignment);
    } catch (err) {
      console.error('[zone-assignments/create] error:', err);
      res.status(500).json({ message: "Erro ao salvar atribuição" });
    }
  });

  // DELETE: remove zone assignment
  app.delete("/api/organizations/:orgId/zone-assignments/:id", isAuthenticated, requireOrgAccess("orgId", "surveys:manage"), async (req, res) => {
    try {
      await storage.deleteZoneAssignment(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error('[zone-assignments/delete] error:', err);
      res.status(500).json({ message: "Erro ao remover atribuição" });
    }
  });

  // === T005: PUBLIC REPORT LINKS ===

  // Create a public shareable link for a survey's results
  app.post("/api/surveys/:surveyId/public-links", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Sem permissão" });
      }
      const { label, expiresInDays } = req.body;
      const token = randomBytes(32).toString('hex');
      const expiresAt = expiresInDays
        ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString()
        : null;
      await db.execute(sql`
        INSERT INTO public_report_tokens (organization_id, survey_id, token, label, expires_at, created_by)
        VALUES (${survey.organizationId}, ${surveyId}, ${token}, ${label || null}, ${expiresAt}::timestamptz, ${userId})
      `);
      res.status(201).json({ token, label: label || null, expiresAt });
    } catch (err) {
      console.error('[public-links/create]', err);
      res.status(500).json({ message: "Erro ao criar link" });
    }
  });

  // List public links for a survey
  app.get("/api/surveys/:surveyId/public-links", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const surveyId = Number(req.params.surveyId);
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Sem permissão" });
      }
      const rows = await db.execute(sql`
        SELECT id, token, label, expires_at, created_at
        FROM public_report_tokens
        WHERE survey_id = ${surveyId}
        ORDER BY created_at DESC
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error('[public-links/list]', err);
      res.status(500).json({ message: "Erro ao listar links" });
    }
  });

  // Delete a public link
  app.delete("/api/public-links/:token", isAuthenticated, async (req, res) => {
    try {
      const userId = await getResolvedUserId(req);
      const tokenVal = req.params.token;
      const rows = await db.execute(sql`
        SELECT prt.id, prt.organization_id FROM public_report_tokens prt
        WHERE prt.token = ${tokenVal}
        LIMIT 1
      `);
      if (!rows.rows || rows.rows.length === 0) return res.status(404).json({ message: "Link não encontrado" });
      const row = rows.rows[0] as any;
      const member = await storage.getMemberByUserId(userId, row.organization_id);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Sem permissão" });
      }
      await db.execute(sql`DELETE FROM public_report_tokens WHERE token = ${tokenVal}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[public-links/delete]', err);
      res.status(500).json({ message: "Erro ao excluir link" });
    }
  });

  // PUBLIC endpoint: get survey results by token (no auth required)
  app.get("/api/public/:token", async (req, res) => {
    try {
      const tokenVal = req.params.token;
      const rows = await db.execute(sql`
        SELECT prt.survey_id, prt.organization_id, prt.expires_at, prt.label
        FROM public_report_tokens prt
        WHERE prt.token = ${tokenVal}
        LIMIT 1
      `);
      if (!rows.rows || rows.rows.length === 0) {
        return res.status(404).json({ message: "Link não encontrado ou expirado" });
      }
      const row = rows.rows[0] as any;
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return res.status(410).json({ message: "Este link expirou" });
      }
      const surveyId = Number(row.survey_id);
      const aggregatedResults = await storage.getSurveyAggregatedResults(surveyId, {});
      res.json({ ...aggregatedResults, publicLabel: row.label });
    } catch (err) {
      console.error('[public-report]', err);
      res.status(500).json({ message: "Erro ao carregar relatório" });
    }
  });

  return httpServer;
}

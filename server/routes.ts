import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, registerAuthRoutes, isAuthenticated, getUserId, getResolvedUserId } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { requireOrgAccess, requireHasOrganization } from "./middleware/org-access";
import { hasPermission, UserRole, canManageRole, getManageableRoles, isInterviewerRole, canManageSurveys, canViewResponses, canViewAnalytics, canAuditResponses } from "@shared/rbac";
import { z } from "zod";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { sql } from "drizzle-orm";
import { authService } from "./auth-service";

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
    
    // Owner sees all members
    if (currentMember.role === 'owner') {
      res.json(allMembers);
    } else if (currentMember.role === 'admin') {
      // Admin sees: themselves, owner (read-only), and roles they can manage
      // Admin does NOT see other admins
      const manageableRoles = getManageableRoles(currentMember.role as UserRole);
      const visibleMembers = allMembers.filter(m => 
        m.userId === userId || // themselves
        m.role === 'owner' || // owner (read-only, but visible)
        manageableRoles.includes(m.role as UserRole)
      );
      res.json(visibleMembers);
    } else if (currentMember.role === 'coordinator') {
      // Coordinator sees: themselves and all interviewers in the organization
      // Note: Cannot filter by "their surveys" as there's no ownership field on surveys
      const visibleMembers = allMembers.filter(m => 
        m.userId === userId || // themselves
        m.role === 'interviewer'
      );
      res.json(visibleMembers);
    } else {
      // Interviewers and viewers see only themselves
      const visibleMembers = allMembers.filter(m => m.userId === userId);
      res.json(visibleMembers);
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
        user = await storage.createUserByEmail(input.email.toLowerCase());
        isNewUser = true;
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
      
      // Outros usuários com permissão surveys:view veem todas
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
    
    res.json(survey);
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
      
      const { response: responseMeta, answers } = api.responses.submit.input.parse(req.body);

      // Backend Validation Logic for Fraud Detection
      let status = "valid";
      let flagReason = null;

      // 1. Verificação de Precisão GPS
      if (responseMeta.accuracy > 50) {
        status = "suspicious";
        flagReason = "Precisão GPS baixa (>50m)";
      }

      // 2. Validação de Áudio (verificação básica de existência)
      if (!responseMeta.audioUrl || !responseMeta.audioHash) {
         return res.status(400).json({ message: "Evidência de áudio obrigatória não encontrada" });
      }
      
      // 3. Verificação de Duração (Exemplo: muito rápido)
      if (responseMeta.duration && responseMeta.duration < 10) {
        status = "suspicious";
        flagReason = flagReason ? `${flagReason}, Duração muito curta` : "Duração muito curta (<10s)";
      }

      const newResponse = await storage.createResponse(
        { 
          ...responseMeta, 
          surveyId: Number(req.params.surveyId),
          interviewerId,
          status,
          flagReason
        },
        answers
      );

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
      
      const aggregatedResults = await storage.getSurveyAggregatedResults(surveyId);
      res.json(aggregatedResults);
    } catch (err) {
      console.error("Erro ao buscar resultados agregados:", err);
      res.status(500).json({ message: "Erro ao buscar resultados" });
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

  // Get viewable surveys for current user (for viewer portal)
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
      
      // Viewers and others with surveys:view can see all active/completed surveys
      if (hasPermission(role, "surveys:view")) {
        const allSurveys = await storage.getSurveys(orgId);
        const viewableSurveys = allSurveys.filter(s => 
          s.status === 'active' || s.status === 'completed' || s.status === 'paused'
        );
        return res.json(viewableSurveys);
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

  return httpServer;
}

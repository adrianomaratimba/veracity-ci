import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, registerAuthRoutes, isAuthenticated, getUserId } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { requireOrgAccess, requireHasOrganization } from "./middleware/org-access";
import { hasPermission, UserRole, canManageRole, getManageableRoles, isInterviewerRole, canManageSurveys, canViewResponses, canViewAnalytics, canAuditResponses } from "@shared/rbac";
import { z } from "zod";

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
    const userId = getUserId(req);
    const orgs = await storage.getOrganizationsByUserId(userId);
    res.json(orgs);
  });

  app.get("/api/organizations/:id", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
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
      const userId = getUserId(req);
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
    const userId = getUserId(req);
    const orgId = Number(req.params.id);
    
    const currentMember = await storage.getMemberByUserId(userId, orgId);
    if (!currentMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const allMembers = await storage.getOrganizationMembers(orgId);
    
    // Owner sees all members
    // Admin sees all except other admins and owner (can only manage coordinator, interviewer, viewer)
    // Others see all members but can't take actions (handled in frontend)
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
    } else {
      // Others see all members (read-only)
      res.json(allMembers);
    }
  });

  // Get current user's membership in organization
  app.get(api.organizations.members.me.path, isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
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
      
      if (input.role === 'owner') {
        return res.status(403).json({ message: "Não é possível convidar como proprietário" });
      }
      
      // Validate that caller can manage the requested role
      if (!canManageRole(callerRole, input.role as UserRole)) {
        return res.status(403).json({ message: "Você não tem permissão para adicionar membros com essa função" });
      }

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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
        return res.status(403).json({ message: "Você não tem permissão para alterar a função deste membro" });
      }
      
      const input = api.organizations.members.updateRole.input.parse(req.body);
      if (input.role === 'owner') return res.status(403).json({ message: "Não é possível promover para proprietário" });
      
      // Validate caller can assign the new role
      if (!canManageRole(callerRole, input.role as UserRole)) {
        return res.status(403).json({ message: "Você não tem permissão para atribuir essa função" });
      }
      
      const updated = await storage.updateMemberRole(memberId, input.role);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar membro" });
    }
  });

  app.delete(api.organizations.members.remove.path, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const memberId = Number(req.params.memberId);
      
      const targetMember = await storage.getMemberById(memberId);
      if (!targetMember) return res.status(404).json({ message: "Membro não encontrado" });
      
      const orgId = targetMember.organizationId;
      
      const currentMember = await storage.getMemberByUserId(userId, orgId);
      if (!currentMember || !hasPermission(currentMember.role as UserRole, "members:remove")) {
        return res.status(403).json({ message: "Você não tem permissão para remover membros" });
      }
      
      const callerRole = currentMember.role as UserRole;
      
      if (targetMember.role === 'owner') return res.status(403).json({ message: "Não é possível remover o proprietário" });
      
      // Validate caller can manage the target member's role
      if (!canManageRole(callerRole, targetMember.role as UserRole)) {
        return res.status(403).json({ message: "Você não tem permissão para remover este membro" });
      }
      
      await storage.removeMember(memberId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao remover membro" });
    }
  });

  // Set password for a member (admin function)
  app.post(api.organizations.members.setPassword.path, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
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
      
      if (targetMember.role === 'owner') return res.status(403).json({ message: "Não é possível alterar a senha do proprietário" });
      
      // Validate caller can manage the target member's role
      if (!canManageRole(callerRole, targetMember.role as UserRole)) {
        return res.status(403).json({ message: "Você não tem permissão para alterar a senha deste membro" });
      }
      
      const { authService } = await import("./auth-service");
      await authService.setUserPasswordByAdmin(targetMember.userId, input.password);
      
      res.json({ success: true });
    } catch (err) {
      console.error("Erro ao definir senha:", err);
      res.status(500).json({ message: "Erro ao definir senha" });
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

  // 3. Surveys - SECURED with RBAC
  // Entrevistadores só veem pesquisas designadas a eles
  app.get(api.surveys.list.path, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const orgId = Number(req.params.orgId);
      
      const member = await storage.getMemberByUserId(userId, orgId);
      if (!member) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const role = member.role as UserRole;
      
      // Entrevistadores só veem pesquisas designadas
      if (isInterviewerRole(role)) {
        const assignedSurveys = await storage.getAssignedSurveys(userId, orgId);
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
    const userId = getUserId(req);
    const surveyId = Number(req.params.id);
    const survey = await storage.getSurvey(surveyId);
    if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
    
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
      const userId = getUserId(req);
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

  // 4. Questions - SECURED with RBAC
  app.post(api.questions.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
      const surveyId = Number(req.params.surveyId);
      const questionId = Number(req.params.id);
      
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const member = await storage.getMemberByUserId(userId, survey.organizationId);
      if (!member || !hasPermission(member.role as UserRole, "surveys:edit")) {
        return res.status(403).json({ message: "Você não tem permissão para editar pesquisas" });
      }
      
      const input = api.questions.update.input.parse(req.body);
      const updated = await storage.updateQuestion(questionId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.delete(api.questions.delete.path, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const surveyId = Number(req.params.surveyId);
      const questionId = Number(req.params.id);
      
      const survey = await storage.getSurvey(surveyId);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
    const userId = getUserId(req);
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
    const userId = getUserId(req);
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
    const userId = getUserId(req);
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
      const userId = getUserId(req);
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
    const userId = getUserId(req);
    const orgId = Number(req.params.orgId);
    
    const isMember = await storage.isUserMemberOfOrg(userId, orgId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const responses = await storage.getResponsesByOrg(orgId);
    res.json(responses);
  });

  // === RESULTS DASHBOARD (For Viewers/Contractors) - Aggregated Data Only ===
  app.get("/api/surveys/:surveyId/results/aggregated", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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
      const userId = getUserId(req);
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

  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
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
    const userId = (req.user as any).claims.sub;
    const orgs = await storage.getOrganizationsByUserId(userId);
    res.json(orgs);
  });

  app.get("/api/organizations/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
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
      const userId = (req.user as any).claims.sub;
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
    const userId = (req.user as any).claims.sub;
    const orgId = Number(req.params.id);
    
    const isMember = await storage.isUserMemberOfOrg(userId, orgId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const members = await storage.getOrganizationMembers(orgId);
    res.json(members);
  });

  app.post(api.organizations.members.invite.path, isAuthenticated, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const inviterId = (req.user as any).claims.sub;
      
      // Authorization check - must be member of org to invite
      const isMember = await storage.isUserMemberOfOrg(inviterId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const input = api.organizations.members.invite.input.parse(req.body);
      
      if (input.role === 'owner') {
        return res.status(403).json({ message: "Não é possível convidar como proprietário" });
      }

      const existingInvitation = await storage.getPendingInvitationByEmail(orgId, input.email);
      if (existingInvitation) {
        return res.status(400).json({ message: "Já existe um convite pendente para este email" });
      }

      const user = await storage.getUserByEmail(input.email);
      
      if (user) {
        const existingMember = await storage.getMemberByUserId(user.id, orgId);
        if (existingMember) {
          return res.status(400).json({ message: "Este usuário já é membro da organização" });
        }

        const member = await storage.addMember({
          organizationId: orgId,
          userId: user.id,
          role: input.role
        });

        return res.status(201).json(member);
      }

      const invitation = await storage.createPendingInvitation({
        organizationId: orgId,
        email: input.email.toLowerCase(),
        role: input.role,
        invitedBy: inviterId
      });

      res.status(201).json({ ...invitation, pending: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao convidar membro" });
    }
  });

  app.get(api.organizations.invitations.list.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
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
      const userId = (req.user as any).claims.sub;
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
      const userId = (req.user as any).claims.sub;
      const orgId = Number(req.params.id);
      const memberId = Number(req.params.memberId);
      
      // Authorization check - must be member of org
      const isMember = await storage.isUserMemberOfOrg(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const member = await storage.getMemberById(memberId);
      if (!member || member.organizationId !== orgId) return res.status(404).json({ message: "Membro não encontrado" });
      if (member.role === 'owner') return res.status(403).json({ message: "Não é possível alterar a função do proprietário" });
      
      const input = api.organizations.members.updateRole.input.parse(req.body);
      if (input.role === 'owner') return res.status(403).json({ message: "Não é possível promover para proprietário" });
      
      const updated = await storage.updateMemberRole(memberId, input.role);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar membro" });
    }
  });

  app.delete(api.organizations.members.remove.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const orgId = Number(req.params.id);
      const memberId = Number(req.params.memberId);
      
      // Authorization check - must be member of org
      const isMember = await storage.isUserMemberOfOrg(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const member = await storage.getMemberById(memberId);
      if (!member || member.organizationId !== orgId) return res.status(404).json({ message: "Membro não encontrado" });
      if (member.role === 'owner') return res.status(403).json({ message: "Não é possível remover o proprietário" });
      
      await storage.removeMember(memberId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao remover membro" });
    }
  });

  app.patch("/api/organizations/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const orgId = Number(req.params.id);
      
      // Authorization check - must be member of org
      const isMember = await storage.isUserMemberOfOrg(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: "Organizacao nao encontrada" });
      
      const partialSchema = api.organizations.create.input.partial();
      const input = partialSchema.parse(req.body);
      const updated = await storage.updateOrganization(orgId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: "Erro ao atualizar organizacao" });
    }
  });

  // 3. Surveys - SECURED
  app.get(api.surveys.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const orgId = Number(req.params.orgId);
    
    const isMember = await storage.isUserMemberOfOrg(userId, orgId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const surveys = await storage.getSurveys(orgId);
    res.json(surveys);
  });

  app.get(api.surveys.get.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const survey = await storage.getSurvey(Number(req.params.id));
    if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
    
    // Authorization check - must be member of org that owns survey
    const isMember = await storage.isUserMemberOfOrg(userId, survey.organizationId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    res.json(survey);
  });

  app.post(api.surveys.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const orgId = Number(req.params.orgId);
      
      // Authorization check - must be member of org
      const isMember = await storage.isUserMemberOfOrg(userId, orgId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const input = api.surveys.create.input.parse(req.body);
      const survey = await storage.createSurvey({ 
        ...input, 
        organizationId: orgId 
      });
      res.status(201).json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.patch(api.surveys.update.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const surveyId = Number(req.params.id);
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa nao encontrada" });
      
      // Authorization check - must be member of org that owns survey
      const isMember = await storage.isUserMemberOfOrg(userId, survey.organizationId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const input = api.surveys.update.input.parse(req.body);
      const updated = await storage.updateSurvey(surveyId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  // 4. Questions - SECURED
  app.post(api.questions.create.path, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const surveyId = Number(req.params.surveyId);
      
      // Get survey to check org membership
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const isMember = await storage.isUserMemberOfOrg(userId, survey.organizationId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
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
      const userId = (req.user as any).claims.sub;
      const surveyId = Number(req.params.surveyId);
      const questionId = Number(req.params.id);
      
      // Get survey to check org membership
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const isMember = await storage.isUserMemberOfOrg(userId, survey.organizationId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
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
      const userId = (req.user as any).claims.sub;
      const surveyId = Number(req.params.surveyId);
      const questionId = Number(req.params.id);
      
      // Get survey to check org membership
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
      
      const isMember = await storage.isUserMemberOfOrg(userId, survey.organizationId);
      if (!isMember) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      await storage.deleteQuestion(questionId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao deletar pergunta" });
    }
  });

  // 5. Responses (Collection) - CRITICAL: GPS & Audio Validation - SECURED
  app.post(api.responses.submit.path, isAuthenticated, async (req, res) => {
    try {
      const interviewerId = (req.user as any).claims.sub;
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
    const userId = (req.user as any).claims.sub;
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
    const userId = (req.user as any).claims.sub;
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
    const userId = (req.user as any).claims.sub;
    const orgId = Number(req.params.id);
    
    const isMember = await storage.isUserMemberOfOrg(userId, orgId);
    if (!isMember) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    const stats = await storage.getOrganizationStats(orgId);
    res.json(stats);
  });

  return httpServer;
}

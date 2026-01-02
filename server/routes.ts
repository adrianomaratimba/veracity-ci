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

  // 2. Organizations
  app.get(api.organizations.list.path, isAuthenticated, async (req, res) => {
    const orgs = await storage.getOrganizations();
    res.json(orgs);
  });

  app.get("/api/organizations/:id", isAuthenticated, async (req, res) => {
    const org = await storage.getOrganization(Number(req.params.id));
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
    const members = await storage.getOrganizationMembers(Number(req.params.id));
    res.json(members);
  });

  app.patch("/api/organizations/:id", isAuthenticated, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
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

  // 3. Surveys
  app.get(api.surveys.list.path, isAuthenticated, async (req, res) => {
    const surveys = await storage.getSurveys(Number(req.params.orgId));
    res.json(surveys);
  });

  app.get(api.surveys.get.path, isAuthenticated, async (req, res) => {
    const survey = await storage.getSurvey(Number(req.params.id));
    if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada" });
    res.json(survey);
  });

  app.post(api.surveys.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.surveys.create.input.parse(req.body);
      const survey = await storage.createSurvey({ 
        ...input, 
        organizationId: Number(req.params.orgId) 
      });
      res.status(201).json(survey);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.patch(api.surveys.update.path, isAuthenticated, async (req, res) => {
    try {
      const surveyId = Number(req.params.id);
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ message: "Pesquisa nao encontrada" });
      
      const input = api.surveys.update.input.parse(req.body);
      const updated = await storage.updateSurvey(surveyId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  // 4. Questions
  app.post(api.questions.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.questions.create.input.parse(req.body);
      const question = await storage.createQuestion({ 
        ...input, 
        surveyId: Number(req.params.surveyId) 
      });
      res.status(201).json(question);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err.errors);
      else throw err;
    }
  });

  app.patch(api.questions.update.path, isAuthenticated, async (req, res) => {
    try {
      const questionId = Number(req.params.id);
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
      const questionId = Number(req.params.id);
      await storage.deleteQuestion(questionId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Erro ao deletar pergunta" });
    }
  });

  // 5. Responses (Collection) - CRITICAL: GPS & Audio Validation
  app.post(api.responses.submit.path, isAuthenticated, async (req, res) => {
    try {
      const { response: responseMeta, answers } = api.responses.submit.input.parse(req.body);
      const interviewerId = (req.user as any).claims.sub;

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
    const responses = await storage.getResponses(Number(req.params.surveyId));
    res.json(responses);
  });

  app.get(api.analytics.surveySummary.path, isAuthenticated, async (req, res) => {
    const analytics = await storage.getSurveyAnalytics(Number(req.params.id));
    res.json(analytics);
  });

  app.get(api.analytics.organizationStats.path, isAuthenticated, async (req, res) => {
    const stats = await storage.getOrganizationStats(Number(req.params.id));
    res.json(stats);
  });

  return httpServer;
}

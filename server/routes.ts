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
    // In a real multi-tenant app, filter by what user has access to
    // For now, listing all or just the one user belongs to
    // const userId = (req.user as any).claims.sub;
    const orgs = await storage.getOrganizations();
    res.json(orgs);
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

  // 3. Surveys
  app.get(api.surveys.list.path, isAuthenticated, async (req, res) => {
    const surveys = await storage.getSurveys(Number(req.params.orgId));
    res.json(surveys);
  });

  app.get(api.surveys.get.path, isAuthenticated, async (req, res) => {
    const survey = await storage.getSurvey(Number(req.params.id));
    if (!survey) return res.status(404).json({ message: "Survey not found" });
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

  // 5. Responses (Collection) - CRITICAL: GPS & Audio Validation
  app.post(api.responses.submit.path, isAuthenticated, async (req, res) => {
    try {
      const { response: responseMeta, answers } = api.responses.submit.input.parse(req.body);
      const interviewerId = (req.user as any).claims.sub;

      // Backend Validation Logic for Fraud Detection
      let status = "valid";
      let flagReason = null;

      // 1. GPS Accuracy Check
      if (responseMeta.accuracy > 50) {
        status = "suspicious";
        flagReason = "Low GPS Accuracy (>50m)";
      }

      // 2. Audio Validation (Basic check existence)
      if (!responseMeta.audioUrl || !responseMeta.audioHash) {
         return res.status(400).json({ message: "Missing mandatory audio evidence" });
      }
      
      // 3. Duration Check (Example: too fast)
      if (responseMeta.duration && responseMeta.duration < 10) {
        status = "suspicious";
        flagReason = flagReason ? `${flagReason}, Duration too short` : "Duration too short (<10s)";
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

  return httpServer;
}

import { storage } from "./storage";
import { db } from "./db";

export async function seed() {
  // Check if organizations exist
  const existingOrgs = await storage.getOrganizations();
  if (existingOrgs.length > 0) return;

  console.log("Seeding database...");

  // Create Demo Organization
  const org = await storage.createOrganization({
    name: "Instituto Demo",
    slug: "instituto-demo",
    plan: "pro"
  });

  // Create Electoral Survey
  const survey = await storage.createSurvey({
    organizationId: org.id,
    title: "Pesquisa Eleitoral 2026 - Capital",
    type: "electoral",
    status: "active",
    location: "São Paulo, SP",
    targetSample: 2000,
    marginOfError: 2.5
  });

  // Create Questions
  await storage.createQuestion({
    surveyId: survey.id,
    text: "Qual sua idade?",
    type: "number",
    order: 1,
    required: true
  });

  await storage.createQuestion({
    surveyId: survey.id,
    text: "Em quem você votaria para Governador?",
    type: "single_choice",
    options: ["Candidato A", "Candidato B", "Candidato C", "Branco/Nulo", "Indeciso"],
    order: 2,
    required: true
  });

  await storage.createQuestion({
    surveyId: survey.id,
    text: "Como você avalia a atual gestão?",
    type: "scale",
    options: ["Ótima", "Boa", "Regular", "Ruim", "Péssima"],
    order: 3,
    required: true
  });

  console.log("Database seeded successfully!");
}

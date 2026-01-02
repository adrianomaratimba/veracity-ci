import { z } from 'zod';
import { 
  insertOrganizationSchema, 
  insertSurveySchema, 
  insertQuestionSchema,
  insertResponseSchema,
  insertAnswerSchema,
  organizations,
  surveys,
  questions,
  responses,
  organizationMembers,
  planTypeEnum,
  surveyTypeEnum,
  surveyStatusEnum,
  userRoleEnum
} from './schema';
import { users } from './models/auth';

// === ERROR SCHEMAS ===
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  forbidden: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// === API CONTRACT ===
export const api = {
  // --- ORGANIZATIONS ---
  organizations: {
    list: {
      method: 'GET' as const,
      path: '/api/organizations',
      responses: {
        200: z.array(z.custom<typeof organizations.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/organizations/:id',
      responses: {
        200: z.custom<typeof organizations.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/organizations',
      input: insertOrganizationSchema,
      responses: {
        201: z.custom<typeof organizations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    members: {
      list: {
        method: 'GET' as const,
        path: '/api/organizations/:id/members',
        responses: {
          200: z.array(z.object({
            id: z.number(),
            userId: z.string(),
            role: z.string(),
            user: z.custom<typeof users.$inferSelect>(),
          })),
        }
      },
      invite: {
        method: 'POST' as const,
        path: '/api/organizations/:id/members',
        input: z.object({
          email: z.string().email(),
          role: userRoleEnum,
        }),
        responses: {
          201: z.custom<typeof organizationMembers.$inferSelect>(),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        }
      }
    }
  },

  // --- SURVEYS ---
  surveys: {
    list: {
      method: 'GET' as const,
      path: '/api/organizations/:orgId/surveys',
      responses: {
        200: z.array(z.custom<typeof surveys.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/surveys/:id',
      responses: {
        200: z.custom<typeof surveys.$inferSelect & { questions: typeof questions.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/organizations/:orgId/surveys',
      input: insertSurveySchema.omit({ organizationId: true }),
      responses: {
        201: z.custom<typeof surveys.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/surveys/:id',
      input: insertSurveySchema.partial(),
      responses: {
        200: z.custom<typeof surveys.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },

  // --- QUESTIONS ---
  questions: {
    create: {
      method: 'POST' as const,
      path: '/api/surveys/:surveyId/questions',
      input: insertQuestionSchema.omit({ surveyId: true }),
      responses: {
        201: z.custom<typeof questions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/questions/:id',
      input: insertQuestionSchema.partial(),
      responses: {
        200: z.custom<typeof questions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/questions/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // --- RESPONSES (COLLECTION) ---
  responses: {
    submit: {
      method: 'POST' as const,
      path: '/api/surveys/:surveyId/responses',
      input: z.object({
        response: insertResponseSchema.omit({ 
          surveyId: true, 
          interviewerId: true 
        }),
        answers: z.array(insertAnswerSchema.omit({ responseId: true })),
      }),
      responses: {
        201: z.object({ id: z.number(), status: z.string() }),
        400: errorSchemas.validation,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/surveys/:surveyId/responses',
      responses: {
        200: z.array(z.custom<typeof responses.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/responses/:id',
      responses: {
        200: z.custom<typeof responses.$inferSelect & { answers: typeof answers.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
  },

  // --- DASHBOARD / ANALYTICS ---
  analytics: {
    surveySummary: {
      method: 'GET' as const,
      path: '/api/surveys/:id/analytics',
      responses: {
        200: z.object({
          totalResponses: z.number(),
          validResponses: z.number(),
          suspiciousResponses: z.number(),
          averageDuration: z.number(),
          locations: z.array(z.object({ lat: z.number(), lng: z.number(), status: z.string() })),
        }),
      },
    }
  }
};

// --- HELPERS ---
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type SurveyInput = z.infer<typeof api.surveys.create.input>;
export type QuestionInput = z.infer<typeof api.questions.create.input>;
export type ResponseSubmission = z.infer<typeof api.responses.submit.input>;

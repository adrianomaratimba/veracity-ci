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
  answers,
  organizationMembers,
  pendingInvitations,
  planTypeEnum,
  surveyTypeEnum,
  surveyStatusEnum,
  userRoleEnum,
  invitationStatusEnum
} from './schema';
import { users, registerUserSchema, loginUserSchema } from './models/auth';

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
  // --- AUTHENTICATION (Native) ---
  auth: {
    register: {
      method: 'POST' as const,
      path: '/api/auth/register',
      input: registerUserSchema,
      responses: {
        201: z.object({
          message: z.string(),
          user: z.object({
            id: z.string(),
            email: z.string(),
            firstName: z.string().nullable(),
            lastName: z.string().nullable(),
          }),
        }),
        400: errorSchemas.validation,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/auth/login',
      input: loginUserSchema,
      responses: {
        200: z.object({
          user: z.custom<typeof users.$inferSelect>(),
        }),
        401: errorSchemas.validation,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    verifyEmail: {
      method: 'POST' as const,
      path: '/api/auth/verify-email',
      input: z.object({ token: z.string() }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    requestPasswordReset: {
      method: 'POST' as const,
      path: '/api/auth/request-password-reset',
      input: z.object({ email: z.string().email() }),
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    resetPassword: {
      method: 'POST' as const,
      path: '/api/auth/reset-password',
      input: z.object({ 
        token: z.string(),
        password: z.string().min(8),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
  },

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
      },
      updateRole: {
        method: 'PATCH' as const,
        path: '/api/members/:memberId',
        input: z.object({
          role: userRoleEnum,
        }),
        responses: {
          200: z.custom<typeof organizationMembers.$inferSelect>(),
          400: errorSchemas.validation,
          404: errorSchemas.notFound,
        }
      },
      remove: {
        method: 'DELETE' as const,
        path: '/api/members/:memberId',
        responses: {
          204: z.void(),
          404: errorSchemas.notFound,
        }
      }
    },
    invitations: {
      list: {
        method: 'GET' as const,
        path: '/api/organizations/:id/invitations',
        responses: {
          200: z.array(z.object({
            id: z.number(),
            organizationId: z.number(),
            email: z.string(),
            role: z.string(),
            status: z.string(),
            invitedAt: z.string().nullable(),
            inviter: z.object({
              firstName: z.string().nullable(),
              lastName: z.string().nullable(),
            }).optional(),
          })),
        }
      },
      cancel: {
        method: 'DELETE' as const,
        path: '/api/invitations/:inviteId',
        responses: {
          204: z.void(),
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
        response: z.object({
          latitude: z.number(),
          longitude: z.number(),
          accuracy: z.number(),
          gpsTimestamp: z.union([z.date(), z.string()]).transform(v => typeof v === 'string' ? new Date(v) : v),
          audioUrl: z.string(),
          audioHash: z.string(),
          audioDuration: z.number().optional(),
          deviceInfo: z.any().optional(),
          startTime: z.union([z.date(), z.string()]).transform(v => typeof v === 'string' ? new Date(v) : v),
          endTime: z.union([z.date(), z.string()]).transform(v => typeof v === 'string' ? new Date(v) : v),
          duration: z.number().optional(),
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
    },
    organizationStats: {
      method: 'GET' as const,
      path: '/api/organizations/:id/stats',
      responses: {
        200: z.object({
          totalInterviews: z.number(),
          interviewsThisMonth: z.number(),
          activeSurveys: z.number(),
          draftSurveys: z.number(),
        }),
      },
    },
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

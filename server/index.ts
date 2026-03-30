import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// T010: Idle interviewer background check — runs every 5 minutes
async function checkIdleInterviewers() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const { sendWhatsAppMessage } = await import("./twilio-client");

    // Find orgs with whatsapp_phone set and active surveys
    const idleRows = await db.execute(sql`
      SELECT DISTINCT
        o.id as org_id,
        o.whatsapp_phone,
        s.id as survey_id,
        s.title as survey_title,
        u.id as interviewer_id,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as interviewer_name,
        MAX(r.created_at) as last_response
      FROM organizations o
      JOIN surveys s ON s.organization_id = o.id AND s.status = 'active'
      JOIN survey_assignments sa ON sa.survey_id = s.id
      JOIN users u ON u.id = sa.interviewer_id
      LEFT JOIN responses r ON r.survey_id = s.id AND r.interviewer_id = u.id
      WHERE o.whatsapp_phone IS NOT NULL
        AND o.whatsapp_phone != ''
      GROUP BY o.id, o.whatsapp_phone, s.id, s.title, u.id, u.email, u.first_name, u.last_name
      HAVING MAX(r.created_at) IS NOT NULL
         AND MAX(r.created_at) < NOW() - INTERVAL '30 minutes'
         AND MAX(r.created_at) > NOW() - INTERVAL '35 minutes'
    `);

    for (const row of (idleRows.rows as any[])) {
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      await sendWhatsAppMessage(
        row.whatsapp_phone,
        `⏱️ *Entrevistadora Parada* [${time}]\n` +
        `*${row.interviewer_name}* está sem atividade há 30 minutos.\n` +
        `Última entrevista: ${new Date(row.last_response).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n` +
        `Pesquisa: ${row.survey_title}`
      ).catch(() => {});
    }
  } catch (e) {
    console.error('[IdleCheck] Error:', e);
  }
}

(async () => {
  await registerRoutes(httpServer, app);

  // Start idle interviewer checker (every 5 minutes)
  setInterval(checkIdleInterviewers, 5 * 60 * 1000);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

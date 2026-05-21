import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Must be 'lax' for OIDC redirect flows to work
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    emailVerified: true,
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    // Check if user denied authorization
    if (req.query.error === 'access_denied') {
      return res.redirect("/?auth_denied=true");
    }
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/?auth_error=true",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  // Check native session first
  if (req.session?.userId) {
    console.log("[auth] Native session authenticated:", req.session.userId);
    return next();
  }

  const user = req.user as any;
  
  // Debug logging
  console.log("[auth] isAuthenticated check:", {
    hasSession: !!req.session,
    sessionUserId: req.session?.userId,
    isAuth: req.isAuthenticated?.(),
    hasUser: !!user,
    hasExpiresAt: !!user?.expires_at,
    expiresAt: user?.expires_at,
    now: Math.floor(Date.now() / 1000)
  });

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // Token expired - try to refresh
  console.log("[auth] Token expired, attempting refresh. now:", now, "expires_at:", user.expires_at);
  
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    console.log("[auth] No refresh token available");
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    console.log("[auth] Token refreshed successfully, new expires_at:", user.expires_at);
    return next();
  } catch (error) {
    console.log("[auth] Token refresh failed:", error);
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Helper to get userId from either native session or Replit Auth
// Should only be called after isAuthenticated middleware
// IMPORTANT: This returns the INTERNAL user ID, not the Replit external ID
export function getUserId(req: any): string {
  // Native session - uses internal ID directly
  if (req.session?.userId) {
    return req.session.userId;
  }
  // Replit Auth - need to resolve internal ID
  // The req.user object should have the internal ID stored after upsert
  // Check if we have the cached internal ID first
  if (req.session?.internalUserId) {
    return req.session.internalUserId;
  }
  // Fallback to Replit ID - this will be resolved by async middleware
  if (req.user?.claims?.sub) {
    // WARNING: This returns Replit ID which may not match internal user ID
    // Use getResolvedUserId for operations requiring internal ID
    console.warn('[auth] getUserId returning Replit sub, may not match internal ID:', req.user.claims.sub);
    return req.user.claims.sub;
  }
  throw new Error("User not authenticated");
}

// Async helper that resolves to internal user ID (preferred for DB operations)
export async function getResolvedUserId(req: any): Promise<string> {
  // Native session - uses internal ID directly
  if (req.session?.userId) {
    return req.session.userId;
  }
  // Check cached internal ID
  if (req.session?.internalUserId) {
    return req.session.internalUserId;
  }
  // Replit Auth - resolve to internal ID
  if (req.user?.claims?.sub) {
    const { authStorage } = await import('./storage');
    const user = await authStorage.getUser(req.user.claims.sub);
    if (user) {
      // Cache for future requests
      if (req.session) {
        req.session.internalUserId = user.id;
      }
      return user.id;
    }
    throw new Error("User not found in database");
  }
  throw new Error("User not authenticated");
}

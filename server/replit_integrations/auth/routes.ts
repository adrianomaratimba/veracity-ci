import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { authService } from "../../auth-service";
import { registerUserSchema, loginUserSchema, sanitizeUser } from "@shared/models/auth";
import { sendPasswordResetEmail } from "../../email-service";
import { authRateLimiter, passwordResetRateLimiter, registrationRateLimiter } from "../../middleware/rate-limit";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user (supports both Replit Auth and native auth)
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      // Check native session first
      if (req.session?.userId) {
        const user = await authService.getUserById(req.session.userId);
        if (user) {
          return res.json(sanitizeUser(user));
        }
      }
      // Check Replit Auth
      if (req.user?.claims?.sub) {
        const user = await authStorage.getUser(req.user.claims.sub);
        return res.json(user ? sanitizeUser(user) : null);
      }
      return res.status(401).json({ message: "Not authenticated" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Native registration (rate limited)
  app.post("/api/auth/register", registrationRateLimiter, async (req, res) => {
    try {
      const parsed = registerUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { user, token } = await authService.register(parsed.data);

      // Auto-accept pending invitations for this email
      await authStorage.acceptPendingInvitations(user.id, user.email!);

      res.status(201).json({
        message: "Conta criada com sucesso. Verifique seu email para ativar sua conta.",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(400).json({ message: error.message || "Erro ao criar conta" });
    }
  });

  // Native login (rate limited - 5 attempts per 15 minutes)
  app.post("/api/auth/login", authRateLimiter, async (req: any, res) => {
    try {
      const parsed = loginUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const user = await authService.login(parsed.data);

      // Set session
      req.session.userId = user.id;

      // Auto-accept pending invitations
      await authStorage.acceptPendingInvitations(user.id, user.email!);

      res.json({ user: sanitizeUser(user) });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(401).json({ message: error.message || "Erro ao fazer login" });
    }
  });

  // Logout (clears native session)
  app.post("/api/auth/logout", (req: any, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Erro ao sair" });
      }
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  // Email verification
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token é obrigatório" });
      }

      await authService.verifyEmail(token);
      res.json({ message: "Email verificado com sucesso" });
    } catch (error: any) {
      console.error("Email verification error:", error);
      res.status(400).json({ message: error.message || "Erro ao verificar email" });
    }
  });

  // Request password reset (rate limited - 3 per hour)
  app.post("/api/auth/request-password-reset", passwordResetRateLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email é obrigatório" });
      }

      const result = await authService.requestPasswordReset(email);
      
      if (result) {
        // Send password reset email
        const userName = result.user.firstName || undefined;
        const emailSent = await sendPasswordResetEmail(email, result.token, userName);
        if (!emailSent) {
          console.warn(`Failed to send password reset email to ${email}, but token was created`);
        }
      }
      
      // Always return success to prevent email enumeration
      res.json({ message: "Se o email estiver cadastrado, você receberá as instruções para redefinir sua senha." });
    } catch (error: any) {
      console.error("Password reset request error:", error);
      res.json({ message: "Se o email estiver cadastrado, você receberá as instruções para redefinir sua senha." });
    }
  });

  // Reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token e senha são obrigatórios" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Senha deve ter pelo menos 8 caracteres" });
      }

      await authService.resetPassword(token, password);
      res.json({ message: "Senha redefinida com sucesso" });
    } catch (error: any) {
      console.error("Password reset error:", error);
      res.status(400).json({ message: error.message || "Erro ao redefinir senha" });
    }
  });
}

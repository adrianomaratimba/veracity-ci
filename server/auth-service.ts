import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { db } from "./db";
import { users, verificationTokens } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import type { RegisterUser, LoginUser, User } from "@shared/models/auth";

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY_HOURS = 24;

export class AuthService {
  async register(data: RegisterUser): Promise<{ user: User; token: string }> {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error("Email já está em uso");
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const [user] = await db
      .insert(users)
      .values({
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        emailVerified: false,
        authProvider: "credentials",
      })
      .returning();

    const verificationToken = await this.createVerificationToken(user.id, "email_verification");

    return { user, token: verificationToken };
  }

  async login(data: LoginUser): Promise<User> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new Error("Email ou senha incorretos");
    }

    // Check if user has a password configured
    if (!user.passwordHash) {
      // Only admin email must use Replit login
      if (user.email === "contato@maratimba.com") {
        throw new Error("Esta conta usa login via Replit. Por favor, use o botão 'Entrar com Replit'.");
      }
      throw new Error("Sua conta ainda não tem senha configurada. Clique em 'Esqueci minha senha' para criar uma.");
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      throw new Error("Email ou senha incorretos");
    }

    // Update authProvider to credentials if user successfully logs in with password
    if (user.authProvider !== "credentials") {
      await db
        .update(users)
        .set({ authProvider: "credentials", updatedAt: new Date() })
        .where(eq(users.id, user.id));
      user.authProvider = "credentials";
    }

    return user;
  }

  async verifyEmail(token: string): Promise<User> {
    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token))
      .limit(1);

    if (!tokenRecord) {
      throw new Error("Token inválido");
    }

    if (tokenRecord.usedAt) {
      throw new Error("Token já foi utilizado");
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new Error("Token expirado");
    }

    if (tokenRecord.type !== "email_verification") {
      throw new Error("Tipo de token inválido");
    }

    await db
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, tokenRecord.id));

    const [user] = await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, tokenRecord.userId))
      .returning();

    return user;
  }

  async createVerificationToken(userId: string, type: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await db.insert(verificationTokens).values({
      userId,
      token,
      type,
      expiresAt,
    });

    return token;
  }

  async requestPasswordReset(email: string): Promise<{ token: string; user: User } | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Allow password reset for ALL users - they can always choose to switch to password auth
    if (!user) {
      return null;
    }

    const token = await this.createVerificationToken(user.id, "password_reset");
    return { token, user };
  }

  async resetAuthProvider(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        authProvider: 'pending',
        passwordHash: null,
        replitUserId: null,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    return user;
  }

  async resetPassword(token: string, newPassword: string): Promise<User> {
    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token))
      .limit(1);

    if (!tokenRecord) {
      throw new Error("Token inválido");
    }

    if (tokenRecord.usedAt) {
      throw new Error("Token já foi utilizado");
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new Error("Token expirado");
    }

    if (tokenRecord.type !== "password_reset") {
      throw new Error("Tipo de token inválido");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await db
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, tokenRecord.id));

    const [user] = await db
      .update(users)
      .set({ 
        passwordHash, 
        authProvider: 'credentials', // Ensure auth provider is set to credentials
        updatedAt: new Date() 
      })
      .where(eq(users.id, tokenRecord.userId))
      .returning();

    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user || null;
  }

  async setUserPasswordByAdmin(userId: string, password: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [user] = await db
      .update(users)
      .set({ 
        passwordHash, 
        authProvider: 'credentials',
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    return user;
  }
}

export const authService = new AuthService();

import { users, type User, type UpsertUser } from "@shared/models/auth";
import { pendingInvitations, organizationMembers } from "@shared/schema";
import { db } from "../../db";
import { eq, and, ilike } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  acceptPendingInvitations(userId: string, email: string): Promise<void>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    if (user.email) {
      await this.acceptPendingInvitations(user.id, user.email);
    }
    
    return user;
  }

  async acceptPendingInvitations(userId: string, email: string): Promise<void> {
    try {
      const invitations = await db.select()
        .from(pendingInvitations)
        .where(and(
          ilike(pendingInvitations.email, email),
          eq(pendingInvitations.status, 'pending')
        ));

      for (const invitation of invitations) {
        const existingMember = await db.select()
          .from(organizationMembers)
          .where(and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.organizationId, invitation.organizationId)
          ));

        if (existingMember.length === 0) {
          await db.insert(organizationMembers).values({
            organizationId: invitation.organizationId,
            userId: userId,
            role: invitation.role
          });
        }

        await db.update(pendingInvitations)
          .set({ status: 'accepted', respondedAt: new Date() })
          .where(eq(pendingInvitations.id, invitation.id));
      }
    } catch (error) {
      console.error('Error accepting pending invitations:', error);
    }
  }
}

export const authStorage = new AuthStorage();

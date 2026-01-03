import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { insertOrganizationSchema, userRoleEnum } from "@shared/schema";
import { z } from "zod";

// List user's organizations
export function useOrganizations() {
  return useQuery({
    queryKey: [api.organizations.list.path],
    queryFn: async () => {
      const res = await fetch(api.organizations.list.path, { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/api/login";
        return [];
      }
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return api.organizations.list.responses[200].parse(await res.json());
    },
  });
}

// Get single organization
export function useOrganization(id: number) {
  return useQuery({
    queryKey: [api.organizations.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.organizations.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/api/login";
        return null;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch organization");
      return api.organizations.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

// Create Organization
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof insertOrganizationSchema>) => {
      const res = await fetch(api.organizations.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create organization");
      return api.organizations.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.organizations.list.path] }),
  });
}

// List Members
export function useOrganizationMembers(orgId: number) {
  return useQuery({
    queryKey: [api.organizations.members.list.path, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const url = buildUrl(api.organizations.members.list.path, { id: orgId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return api.organizations.members.list.responses[200].parse(await res.json());
    },
    enabled: !!orgId,
  });
}

// Get current user's membership
export function useCurrentMember(orgId: number) {
  return useQuery({
    queryKey: [api.organizations.members.me.path, orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const url = buildUrl(api.organizations.members.me.path, { id: orgId });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch current member");
      return api.organizations.members.me.responses[200].parse(await res.json());
    },
    enabled: !!orgId,
  });
}

// Invite Member
export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, email, role, password }: { orgId: number; email: string; role: z.infer<typeof userRoleEnum>; password?: string }) => {
      const url = buildUrl(api.organizations.members.invite.path, { id: orgId });
      const body: { email: string; role: z.infer<typeof userRoleEnum>; password?: string } = { email, role };
      if (password) body.password = password;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to invite member");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.organizations.members.list.path, variables.orgId] });
      queryClient.invalidateQueries({ queryKey: [api.organizations.invitations.list.path, variables.orgId] });
    },
  });
}

// Set Member Password (admin function)
export function useSetMemberPassword() {
  return useMutation({
    mutationFn: async ({ memberId, password }: { memberId: number; password: string }) => {
      const url = buildUrl(api.organizations.members.setPassword.path, { memberId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to set password");
      }
      return res.json();
    },
  });
}

// List Pending Invitations
export function usePendingInvitations(orgId: number) {
  return useQuery({
    queryKey: [api.organizations.invitations.list.path, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const url = buildUrl(api.organizations.invitations.list.path, { id: orgId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invitations");
      return api.organizations.invitations.list.responses[200].parse(await res.json());
    },
    enabled: !!orgId,
  });
}

// Cancel Pending Invitation
export function useCancelInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId, orgId }: { inviteId: number; orgId: number }) => {
      const url = buildUrl(api.organizations.invitations.cancel.path, { inviteId });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to cancel invitation");
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.organizations.invitations.list.path, variables.orgId] });
    },
  });
}

// Update Member Role
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role, orgId }: { memberId: number; role: z.infer<typeof userRoleEnum>; orgId: number }) => {
      const url = buildUrl(api.organizations.members.updateRole.path, { memberId });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update member role");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.organizations.members.list.path, variables.orgId] });
    },
  });
}

// Remove Member
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, orgId }: { memberId: number; orgId: number }) => {
      const url = buildUrl(api.organizations.members.remove.path, { memberId });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove member");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.organizations.members.list.path, variables.orgId] });
    },
  });
}

// Organization Stats
export function useOrganizationStats(orgId: number) {
  return useQuery({
    queryKey: [api.analytics.organizationStats.path, orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const url = buildUrl(api.analytics.organizationStats.path, { id: orgId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organization stats");
      return api.analytics.organizationStats.responses[200].parse(await res.json());
    },
    enabled: !!orgId,
  });
}

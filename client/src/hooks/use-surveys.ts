import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { insertSurveySchema } from "@shared/schema";
import { z } from "zod";

export function useSurveys(orgId: number) {
  return useQuery({
    queryKey: [api.surveys.list.path, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const url = buildUrl(api.surveys.list.path, { orgId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch surveys");
      return api.surveys.list.responses[200].parse(await res.json());
    },
    enabled: !!orgId,
  });
}

export function useSurvey(id: number) {
  return useQuery({
    queryKey: [api.surveys.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.surveys.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch survey");
      return api.surveys.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, data }: { orgId: number; data: z.infer<typeof api.surveys.create.input> }) => {
      const url = buildUrl(api.surveys.create.path, { orgId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create survey");
      return api.surveys.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path, variables.orgId] });
    },
  });
}

export function useUpdateSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId, data }: { id: number; orgId?: number; data: Partial<z.infer<typeof insertSurveySchema>> }) => {
      const url = buildUrl(api.surveys.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update survey");
      return { survey: api.surveys.update.responses[200].parse(await res.json()), orgId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, result.survey.id] });
      if (result.orgId) {
        queryClient.invalidateQueries({ queryKey: [api.surveys.list.path, result.orgId] });
      }
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path] });
    },
  });
}

// Survey Analytics
export function useSurveyAnalytics(id: number) {
  return useQuery({
    queryKey: [api.analytics.surveySummary.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.analytics.surveySummary.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return api.analytics.surveySummary.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

// Trashed Surveys
export function useTrashedSurveys(orgId: number) {
  return useQuery({
    queryKey: ["/api/organizations", orgId, "surveys", "trash"],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`/api/organizations/${orgId}/surveys/trash`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch trashed surveys");
      return res.json();
    },
    enabled: !!orgId,
  });
}

// Move survey to trash
export function useTrashSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId }: { id: number; orgId: number }) => {
      const res = await fetch(`/api/surveys/${id}/trash`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to trash survey");
      return { survey: await res.json(), orgId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path, result.orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", result.orgId, "surveys", "trash"] });
    },
  });
}

// Restore survey from trash
export function useRestoreSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId }: { id: number; orgId: number }) => {
      const res = await fetch(`/api/surveys/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to restore survey");
      return { survey: await res.json(), orgId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path, result.orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", result.orgId, "surveys", "trash"] });
    },
  });
}

// Permanently delete survey
export function useDeleteSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId }: { id: number; orgId: number }) => {
      const res = await fetch(`/api/surveys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete survey");
      return { orgId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", result.orgId, "surveys", "trash"] });
    },
  });
}

// Duplicate survey
export function useDuplicateSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId, title }: { id: number; orgId: number; title?: string }) => {
      const res = await fetch(`/api/surveys/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to duplicate survey");
      return { survey: await res.json(), orgId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.list.path, result.orgId] });
    },
  });
}

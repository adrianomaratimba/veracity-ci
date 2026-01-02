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
    mutationFn: async ({ id, data }: { id: number; data: Partial<z.infer<typeof insertSurveySchema>> }) => {
      const url = buildUrl(api.surveys.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update survey");
      return api.surveys.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, variables.id] });
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

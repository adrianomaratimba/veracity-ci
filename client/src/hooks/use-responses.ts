import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

export function useSubmitResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ surveyId, data }: { surveyId: number; data: z.infer<typeof api.responses.submit.input> }) => {
      const url = buildUrl(api.responses.submit.path, { surveyId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Submission failed' }));
        throw new Error(err.message || "Failed to submit response");
      }
      
      return api.responses.submit.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries if needed, mainly for analytics
      const analyticsUrl = buildUrl(api.analytics.surveySummary.path, { id: variables.surveyId });
      queryClient.invalidateQueries({ queryKey: [analyticsUrl] });
    },
  });
}

export function useResponseList(surveyId: number) {
  return useQuery({
    queryKey: [api.responses.list.path, surveyId],
    queryFn: async () => {
      if (!surveyId) return [];
      const url = buildUrl(api.responses.list.path, { surveyId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch responses");
      return api.responses.list.responses[200].parse(await res.json());
    },
    enabled: !!surveyId,
  });
}

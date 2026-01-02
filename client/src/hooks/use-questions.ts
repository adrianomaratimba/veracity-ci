import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { insertQuestionSchema } from "@shared/schema";
import { z } from "zod";

export function useCreateQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ surveyId, data }: { surveyId: number; data: z.infer<typeof api.questions.create.input> }) => {
      const url = buildUrl(api.questions.create.path, { surveyId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create question");
      return api.questions.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, variables.surveyId] });
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, surveyId, data }: { id: number; surveyId: number; data: Partial<z.infer<typeof insertQuestionSchema>> }) => {
      const url = buildUrl(api.questions.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update question");
      return api.questions.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, variables.surveyId] });
    },
  });
}

export function useDeleteQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, surveyId }: { id: number; surveyId: number }) => {
      const url = buildUrl(api.questions.delete.path, { id });
      const res = await fetch(url, { 
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to delete question");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.surveys.get.path, variables.surveyId] });
    },
  });
}

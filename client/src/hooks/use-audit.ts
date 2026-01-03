import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useOrgResponses(orgId: number) {
  return useQuery({
    queryKey: [api.responses.listByOrg.path, orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const url = buildUrl(api.responses.listByOrg.path, { orgId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch responses");
      return api.responses.listByOrg.responses[200].parse(await res.json());
    },
    enabled: !!orgId,
  });
}

export function useUpdateResponseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ responseId, status, reviewNote }: { responseId: number; status: 'valid' | 'invalid'; reviewNote?: string }) => {
      const url = buildUrl(api.responses.updateStatus.path, { id: responseId });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erro ao atualizar status' }));
        throw new Error(err.message || "Erro ao atualizar status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.responses.listByOrg.path] });
    },
  });
}

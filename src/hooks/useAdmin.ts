import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Problem, ProblemSummary, User } from "@/lib/types";
import type { ProblemInput } from "@/lib/admin-types";

export const useAdminProblems = () =>
  useQuery({ queryKey: ["admin", "problems"], queryFn: () => api.get<ProblemSummary[]>("/admin/problems") });

export const useAdminProblem = (id: number | null) =>
  useQuery({
    queryKey: ["admin", "problem", id],
    queryFn: () => api.get<Problem>(`/admin/problems/${id}`),
    enabled: id !== null,
    gcTime: 0,
  });

export const useAdminUsers = () =>
  useQuery({ queryKey: ["admin", "users"], queryFn: () => api.get<User[]>("/admin/users") });

/**
 * Runs an admin write, then refreshes the admin views and the public problem list. Errors surface as toasts.
 * (Track/section/lesson management is not here: that content is creator-owned and is edited through the creator API.)
 */
function useAdminMutation<TVars, TResult = unknown>(fn: (v: TVars) => Promise<TResult>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ["admin", "problems", "problem"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      if (success) toast.success(success);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Request failed"),
  });
}

export const useSaveProblem = () =>
  useAdminMutation(({ id, data }: { id?: number; data: ProblemInput }) =>
    id ? api.put<Problem>(`/admin/problems/${id}`, data) : api.post<Problem>("/admin/problems", data), "Problem saved");

export const useDeleteProblem = () =>
  useAdminMutation((id: number) => api.delete(`/admin/problems/${id}`), "Problem deleted");

export const useSetRole = () =>
  useAdminMutation(({ id, role }: { id: number; role: "USER" | "ADMIN" }) =>
    api.patch<User>(`/admin/users/${id}/role`, { role }), "Role updated");

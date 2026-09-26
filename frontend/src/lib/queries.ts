import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";
import { todayISO } from "./format";
import type { DayLog, ExportData, Goal, Stats, User } from "./types";

export const qk = {
  me: ["auth", "me"] as const,
  goals: ["goals"] as const,
  dayLogs: ["day-logs"] as const,
  dayLog: (date: string) => ["day-logs", date] as const,
  stats: ["stats"] as const,
};

let authGeneration = 0;

// Preserva a consulta observada pelo RequireAuth ao trocar de sessão.
export function resetPrivateCache(qc: QueryClient, me: User | null) {
  authGeneration += 1;
  void qc.cancelQueries();
  qc.removeQueries({
    predicate: ({ queryKey }) =>
      queryKey.length !== qk.me.length || queryKey.some((key, i) => key !== qk.me[i]),
  });
  qc.setQueryData(qk.me, me);
}

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<User>("/auth/me", { signal });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; password: string }) =>
      apiFetch<User>("/auth/login", { method: "POST", body: payload }),
    onSuccess: (user) => {
      resetPrivateCache(qc, user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      email: string;
      password: string;
      confirm_password: string;
    }) => apiFetch<User>("/auth/register", { method: "POST", body: payload }),
    onSuccess: (user) => {
      resetPrivateCache(qc, user);
    },
  });
}

export function useMarkOnboardingSeen() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: () => apiFetch<void>("/auth/me/onboarding-seen", { method: "POST" }),
    onSuccess: (_data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      return qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useUpdateName() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (name: string) => apiFetch<User>("/auth/me", { method: "PATCH", body: { name } }),
    onSuccess: (user, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      qc.setQueryData(qk.me, user);
    },
  });
}

export function useChangeEmail() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (payload: { new_email: string; confirm_new_email: string; password: string }) =>
      apiFetch<User>("/auth/me/change-email", { method: "POST", body: payload }),
    onSuccess: (user, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      qc.setQueryData(qk.me, user);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (payload: {
      current_password: string;
      new_password: string;
      confirm_new_password: string;
    }) => apiFetch<void>("/auth/me/change-password", { method: "POST", body: payload }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    onSuccess: (_data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      resetPrivateCache(qc, null);
    },
  });
}

export function useExportMyData() {
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: () => apiFetch<ExportData>("/auth/me/export"),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (password: string) =>
      apiFetch<void>("/auth/me/delete", { method: "POST", body: { password } }),
    onSuccess: (_data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      resetPrivateCache(qc, null);
    },
  });
}

export function useGoals(opts?: { includeArchived?: boolean }) {
  const params = opts?.includeArchived ? "?include_archived=true" : "";
  return useQuery({
    queryKey: [...qk.goals, opts?.includeArchived ?? false],
    queryFn: ({ signal }) => apiFetch<Goal[]>(`/goals${params}`, { signal }),
  });
}

// Histórico paginado — cada página busca os `limit` registros armazenados mais
// recentes antes do mais antigo já carregado (`before`). Retorna só dias com
// linha no banco; a tela "Hoje"/Home sintetiza os dias sem registro.
export function useDayLogs(limit = 14) {
  return useInfiniteQuery({
    queryKey: [...qk.dayLogs, { limit }],
    queryFn: ({ pageParam, signal }) =>
      apiFetch<DayLog[]>(`/day-logs?limit=${limit}${pageParam ? `&before=${pageParam}` : ""}`, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.length < limit ? undefined : lastPage[lastPage.length - 1]?.date,
  });
}

export function useDayLog(date: string) {
  return useQuery({
    queryKey: qk.dayLog(date),
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<DayLog>(`/day-logs/${date}`, { signal });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

export function useStats() {
  const today = todayISO();
  return useQuery({
    queryKey: [...qk.stats, today],
    queryFn: ({ signal }) => apiFetch<Stats>(`/stats?today=${today}`, { signal }),
  });
}

type SaveDayPayload = {
  date: string;
  mood: string | null;
  note: string | null;
  entries: { goal_id: string; level: number; done_at: string | null }[];
};

// Grava a resposta do servidor direto no cache (sem esperar refetch) e invalida
// as listas/estatísticas agregadas, que precisam ser recalculadas no servidor.
function applyDayResult(qc: QueryClient, data: DayLog) {
  qc.setQueryData(qk.dayLog(data.date), data);
  qc.invalidateQueries({ queryKey: qk.dayLogs });
  qc.invalidateQueries({ queryKey: qk.stats });
}

// Salva progresso parcial (não finaliza).
export function useSaveDay() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: ({ date, ...body }: SaveDayPayload) =>
      apiFetch<DayLog>(`/day-logs/${date}`, { method: "PUT", body }),
    onSuccess: (data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      applyDayResult(qc, data);
    },
  });
}

// Consolida o dia e marca finalized=true.
export function useFinalizeDay() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (date: string) =>
      apiFetch<DayLog>(`/day-logs/${date}/finalize`, { method: "POST" }),
    onSuccess: (data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      applyDayResult(qc, data);
    },
  });
}

export function useDayOff() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (date: string) =>
      apiFetch<DayLog>(`/day-logs/${date}/dayoff`, { method: "POST" }),
    onSuccess: (data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      applyDayResult(qc, data);
    },
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (payload: Omit<Goal, "id" | "archived_at">) =>
      apiFetch<Goal>("/goals", { method: "POST", body: payload }),
    onSuccess: (_data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      return qc.invalidateQueries({ queryKey: qk.goals });
    },
  });
}

export function useCreateGoalsBatch() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (goals: Omit<Goal, "id" | "archived_at">[]) =>
      apiFetch<Goal[]>("/goals/batch", { method: "POST", body: { goals } }),
    onSuccess: (_data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      return qc.invalidateQueries({ queryKey: qk.goals });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: ({ id, ...payload }: Goal) =>
      apiFetch<Goal>(`/goals/${id}`, { method: "PUT", body: payload }),
    onSuccess: (_data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      return qc.invalidateQueries({ queryKey: qk.goals });
    },
  });
}

export function useArchiveGoal() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => ({ generation: authGeneration }),
    mutationFn: (id: string) => apiFetch<void>(`/goals/${id}`, { method: "DELETE" }),
    onSuccess: (_data, _variables, context) => {
      if (context?.generation !== authGeneration) return;
      return qc.invalidateQueries({ queryKey: qk.goals });
    },
  });
}

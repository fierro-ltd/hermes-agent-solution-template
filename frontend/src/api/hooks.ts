import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJSON } from "./client";
import { authClient } from "@/lib/auth-client";
import type {
  Submission,
  SubmissionListResponse,
  Review,
  Setting,
  Stats,
  ProviderConfig,
  ProviderConfigUpdate,
  RuntimeConfig,
  WorkflowProgress,
  AgentTrace,
} from "./types";

// Returns a getter that fetches the current session token from better-auth
function useToken(): () => Promise<string | null> {
  return async () => {
    const session = await authClient.getSession();
    return session?.data?.session?.token ?? null;
  };
}

// ---- Queries ----

export function useSubmissions() {
  const getToken = useToken();
  return useQuery({
    queryKey: ["submissions"],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<SubmissionListResponse>("/api/submissions", undefined, token);
    },
  });
}

export function useSubmission(
  id: string,
  options?: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data?: Submission } }) => number | false);
  },
) {
  const getToken = useToken();
  return useQuery({
    queryKey: ["submissions", id],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<Submission>(`/api/submissions/${id}`, undefined, token);
    },
    enabled: !!id,
    refetchInterval: options?.refetchInterval as any,
  });
}

export function useSubmissionReviews(id: string) {
  const getToken = useToken();
  return useQuery({
    queryKey: ["submissions", id, "reviews"],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<Review[]>(
        `/api/submissions/${id}/reviews`,
        undefined,
        token,
      );
    },
    enabled: !!id,
  });
}

export function useStats() {
  const getToken = useToken();
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<Stats>("/api/stats", undefined, token);
    },
  });
}

export function useSettings() {
  const getToken = useToken();
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<Setting[]>("/api/settings", undefined, token);
    },
  });
}

export function useSubmissionProgress(id: string) {
  const getToken = useToken();
  return useQuery({
    queryKey: ["submission-progress", id],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<WorkflowProgress>(
        `/api/submissions/${id}/progress`,
        undefined,
        token,
      );
    },
    enabled: !!id,
    refetchInterval: 3000, // Poll every 3s while evaluating
  });
}

export function useSubmissionTrace(id: string, status: string) {
  const getToken = useToken();
  return useQuery({
    queryKey: ["submission-trace", id],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<AgentTrace>(
        `/api/submissions/${id}/trace`,
        undefined,
        token,
      );
    },
    enabled: !!id && status !== "pending" && status !== "evaluating",
  });
}

// ---- Mutations ----

export function useDeleteSubmission() {
  const getToken = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return fetchJSON<{ deleted: boolean }>(`/api/submissions/${id}`, { method: "DELETE" }, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["submissions"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useCreateSubmission() {
  const getToken = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      student_name: string;
      content?: string;
      file?: File;
    }) => {
      const token = await getToken();
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("student_name", data.student_name);
      if (data.content) {
        formData.append("content", data.content);
      }
      if (data.file) {
        formData.append("file", data.file);
      }
      return fetchJSON<Submission>(
        "/api/submissions",
        { method: "POST", body: formData },
        token,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["submissions"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useSubmitReview(submissionId: string) {
  const getToken = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      decision: string;
      score_override?: number | null;
      feedback?: string | null;
    }) => {
      const token = await getToken();
      return fetchJSON<Review>(
        `/api/submissions/${submissionId}/review`,
        { method: "POST", body: JSON.stringify(data) },
        token,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["submissions", submissionId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["submissions", submissionId, "reviews"],
      });
      void queryClient.invalidateQueries({ queryKey: ["submissions"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdateSetting() {
  const getToken = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const token = await getToken();
      return fetchJSON<Setting>(
        `/api/settings/${key}`,
        { method: "PUT", body: JSON.stringify({ key, value }) },
        token,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// ---- Runtime configuration ----

export function useRuntimeConfig() {
  const getToken = useToken();
  return useQuery({
    queryKey: ["runtime-config"],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<RuntimeConfig>("/api/settings/runtime", undefined, token);
    },
  });
}

// ---- Provider configuration ----

export function useProviderConfig() {
  const getToken = useToken();
  return useQuery({
    queryKey: ["provider-config"],
    queryFn: async () => {
      const token = await getToken();
      return fetchJSON<ProviderConfig>("/api/settings/provider", undefined, token);
    },
  });
}

export function useUpdateProviderConfig() {
  const getToken = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProviderConfigUpdate) => {
      const token = await getToken();
      return fetchJSON<ProviderConfig>(
        "/api/settings/provider",
        { method: "PUT", body: JSON.stringify(data) },
        token,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider-config"] });
    },
  });
}

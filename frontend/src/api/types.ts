export type SubmissionStatus =
  | "pending"
  | "evaluating"
  | "review"
  | "approved"
  | "rejected";

export type ReviewDecision = "approve" | "reject" | "re_evaluate";

export interface AgentFeedback {
  score: number;
  strengths: string[];
  weaknesses: string[];
  reasoning: string;
}

export interface Review {
  id: string;
  submission_id: string;
  decision: ReviewDecision;
  score_override: number | null;
  feedback: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  title: string;
  student_name: string;
  content: string;
  status: SubmissionStatus;
  workflow_id: string | null;
  agent_feedback: AgentFeedback | null;
  final_score: number | null;
  professor_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface SubmissionListResponse {
  submissions: Submission[];
  total: number;
}

export interface Stats {
  total_submissions: number;
  pending_reviews: number;
  approved: number;
  average_score: number | null;
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  provider: string;
  model: string;
  api_key_set: boolean;
  api_key_hint: string;
}

export interface ProviderConfigUpdate {
  provider: string;
  model: string;
  api_key: string;
}

export interface Provider {
  id: string;
  name: string;
  env_var: string;
  enabled: boolean;
  models: string[];
}

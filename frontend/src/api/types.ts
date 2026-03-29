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
  content_type: "text" | "image";
  file_path: string | null;
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
  total: number;
  completed: number;
  failed: number;
  pending_reviews: number;
  approved: number;
  rejected: number;
  avg_score: number | null;
  avg_processing_seconds: number | null;
  agent_agreement_rate: number | null;
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  provider: string;
  model: string;
  api_key_set: boolean;
  api_key_hint: string;
  vision_provider?: string;
  vision_model?: string;
}

export interface ProviderConfigUpdate {
  provider: string;
  model: string;
  api_key: string;
  vision_provider?: string;
  vision_model?: string;
}

export interface Provider {
  id: string;
  name: string;
  env_var: string;
  enabled: boolean;
  models: string[];
}

// ---------------------------------------------------------------------------
// Workflow progress (real Temporal activity tracking)
// ---------------------------------------------------------------------------

export interface WorkflowActivity {
  name: string;
  status: "scheduled" | "running" | "completed" | "failed";
  timestamp: string | null;
}

export interface WorkflowProgress {
  status: string;
  workflow_status?: string;
  activities: WorkflowActivity[];
  temporal_ui_port?: string;
  workflow_id?: string;
  error?: string;
}

export interface TraceStep {
  type: "reasoning" | "tool_call" | "tool_result" | "message";
  content?: string;
  name?: string;
  call_id?: string;
  args?: Record<string, unknown>;
  output?: string;
  duration_ms?: number;
  timestamp: number;
}

export interface RuntimeConfig {
  hermes_api_url: string;
  hermes_api_key_set: boolean;
  opencode_go_key_set: boolean;
  openrouter_key_set: boolean;
  temporal_address: string;
}

export interface AgentTrace {
  steps: TraceStep[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  session_id: string;
  duration_seconds: number;
  tools_used: string[];
  model: string;
}

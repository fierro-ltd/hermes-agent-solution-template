import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useSubmission,
  useSubmissionReviews,
  useSubmitReview,
  useSubmissionProgress,
} from "@/api/hooks";
import type { WorkflowActivity } from "@/api/types";
import {
  CheckCircle,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Loader2,
  ExternalLink,
  Check,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import type { SubmissionStatus } from "@/api/types";

export const Route = createFileRoute("/submissions/$id")({
  component: SubmissionDetailPage,
});

const timelineSteps: SubmissionStatus[] = [
  "pending",
  "evaluating",
  "review",
  "approved",
];

function getTimelineIndex(status: SubmissionStatus): number {
  if (status === "rejected") return 2;
  return timelineSteps.indexOf(status);
}

function StatusTimeline({ status }: { status: SubmissionStatus }) {
  const currentIndex = getTimelineIndex(status);
  const steps =
    status === "rejected"
      ? (["pending", "evaluating", "review", "rejected"] as const)
      : timelineSteps;

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => {
        const isCompleted = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isCurrent
                  ? step === "rejected"
                    ? "bg-red-100 text-red-700"
                    : step === "approved"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  : isCompleted
                    ? "bg-muted text-foreground"
                    : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {step.charAt(0).toUpperCase() + step.slice(1)}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-6 ${
                  i < currentIndex ? "bg-foreground" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evaluating spinner with cycling status messages
// ---------------------------------------------------------------------------

const evaluatingMessages = [
  "Analyzing content...",
  "Evaluating against rubric...",
  "Generating feedback...",
];

function EvaluatingSpinner() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % evaluatingMessages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <Loader2 className="size-8 animate-spin text-blue-500" />
      <p className="text-sm font-medium">
        Agent is evaluating this submission...
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-blue-500 animate-pulse" />
        {evaluatingMessages[messageIndex]}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detailed evaluating progress card (right panel) -- real Temporal data
// ---------------------------------------------------------------------------

const activityLabels: Record<string, string> = {
  evaluate_submission: "Evaluating submission",
  notify_reviewer: "Notifying reviewer",
  record_final_grade: "Recording grade",
};

function humanizeActivityName(name: string): string {
  return activityLabels[name] ?? name.replace(/_/g, " ");
}

function ActivityStatusIcon({ status }: { status: WorkflowActivity["status"] }) {
  switch (status) {
    case "completed":
      return <Check className="size-4 text-green-500 shrink-0" />;
    case "running":
      return <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />;
    case "failed":
      return <XCircle className="size-4 text-red-500 shrink-0" />;
    case "scheduled":
    default:
      return <Circle className="size-4 text-muted-foreground/40 shrink-0" />;
  }
}

function EvaluatingProgressCard({ submissionId }: { submissionId: string }) {
  const { data: progress } = useSubmissionProgress(submissionId);
  const activities = progress?.activities ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-blue-500" />
          AI Agent is evaluating...
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Waiting for worker to pick up task...
          </div>
        ) : (
          <ul className="space-y-2">
            {activities.map((activity, i) => (
              <li
                key={`${activity.name}-${i}`}
                className="flex items-center gap-2.5 text-sm"
              >
                <ActivityStatusIcon status={activity.status} />
                <span
                  className={
                    activity.status === "completed"
                      ? "text-muted-foreground"
                      : activity.status === "running"
                        ? "text-foreground font-medium"
                        : activity.status === "failed"
                          ? "text-red-600 font-medium"
                          : "text-muted-foreground/60"
                  }
                >
                  {humanizeActivityName(activity.name)}
                  {activity.status === "running" && "..."}
                </span>
              </li>
            ))}
          </ul>
        )}
        {progress?.error && (
          <p className="text-xs text-amber-600 mt-3 border-t pt-3">
            Error fetching progress: {progress.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Temporal UI debug link (URL provided by /progress API endpoint)
// ---------------------------------------------------------------------------

function TemporalLink({ submissionId }: { submissionId: string }) {
  const { data: progress } = useSubmissionProgress(submissionId);
  const url = progress?.temporal_ui_url;

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ExternalLink className="size-3" />
      View in Temporal UI
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: sub, isLoading } = useSubmission(id, {
    refetchInterval: (query) =>
      query.state.data?.status === "evaluating" ? 5000 : false,
  });

  const { data: reviews } = useSubmissionReviews(id);
  const submitReview = useSubmitReview(id);

  const [scoreOverride, setScoreOverride] = useState("");
  const [showReasoning, setShowReasoning] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  if (isLoading) {
    return (
      <div className="p-8 text-muted-foreground">Loading submission...</div>
    );
  }

  if (!sub) {
    return (
      <div className="p-8 text-muted-foreground">Submission not found.</div>
    );
  }

  const isFinalized =
    sub.status === "approved" || sub.status === "rejected";
  const latestReview = (sub as any).latest_review;
  const allReviewSources = [
    latestReview,
    ...(reviews ?? []),
  ].filter(Boolean);

  let feedback: { suggested_score: number; score?: number; strengths: string[]; weaknesses: string[]; reasoning: string } | null = null;
  for (const r of allReviewSources) {
    if (r?.agent_feedback) {
      try {
        const parsed = typeof r.agent_feedback === "string"
          ? JSON.parse(r.agent_feedback)
          : r.agent_feedback;
        if (parsed && Array.isArray(parsed.strengths) && Array.isArray(parsed.weaknesses)) {
          feedback = parsed;
          break;
        }
      } catch { /* invalid JSON, try next */ }
    }
  }

  if (!feedback && sub.agent_feedback) {
    const af = sub.agent_feedback;
    if (Array.isArray(af.strengths) && Array.isArray(af.weaknesses)) {
      feedback = {
        suggested_score: af.score,
        strengths: af.strengths,
        weaknesses: af.weaknesses,
        reasoning: af.reasoning,
      };
    }
  }

  function handleDecision(decision: "approve" | "reject") {
    const override = scoreOverride.trim()
      ? Number(scoreOverride)
      : null;
    submitReview.mutate(
      { decision, score_override: override },
      {
        onSuccess: () => {
          toast.success(
            decision === "approve"
              ? "Submission approved"
              : "Submission rejected",
          );
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  function handleReEvaluate() {
    if (!showFeedbackInput) {
      setShowFeedbackInput(true);
      return;
    }
    submitReview.mutate(
      {
        decision: "re_evaluate",
        feedback: feedbackText.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Re-evaluation requested");
          setShowFeedbackInput(false);
          setFeedbackText("");
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: "/submissions" })}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">{sub.title}</h1>
            <p className="text-sm text-muted-foreground">
              by {sub.student_name}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusTimeline status={sub.status} />
          {sub.workflow_id && (
            <TemporalLink submissionId={id} />
          )}
        </div>
      </div>

      {/* Split panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel -- Submission content (60%) */}
        <div className="w-3/5 border-r">
          <ScrollArea className="h-full">
            <div className="p-8">
              <h2 className="text-lg font-semibold mb-4">
                Submission Content
              </h2>
              {sub.status === "evaluating" && (
                <div className="mb-6">
                  <EvaluatingSpinner />
                </div>
              )}
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {sub.content}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right panel -- Agent evaluation (40%) */}
        <div className="w-2/5">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {isFinalized && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Final Result</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Final Score
                      </span>
                      <span className="text-2xl font-bold">
                        {sub.final_score ?? "--"}
                      </span>
                    </div>
                    {sub.professor_notes && (
                      <div>
                        <span className="text-sm font-medium">
                          Professor Notes
                        </span>
                        <p className="text-sm text-muted-foreground mt-1">
                          {sub.professor_notes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {feedback ? (
                <>
                  {/* Suggested Score */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Agent Evaluation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Suggested Score
                        </span>
                        <span className="text-4xl font-bold text-blue-600">
                          {feedback.score ?? feedback.suggested_score}
                        </span>
                      </div>

                      {!isFinalized && (
                        <div className="space-y-1">
                          <label
                            htmlFor="score-override"
                            className="text-xs text-muted-foreground"
                          >
                            Score Override (optional)
                          </label>
                          <Input
                            id="score-override"
                            type="number"
                            placeholder="Override score"
                            value={scoreOverride}
                            onChange={(e) =>
                              setScoreOverride(e.target.value)
                            }
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Strengths */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-green-700">
                      Strengths
                    </h3>
                    <ul className="space-y-1">
                      {(feedback.strengths ?? []).map((s, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-green-500" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Weaknesses */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-red-700">
                      Weaknesses
                    </h3>
                    <ul className="space-y-1">
                      {(feedback.weaknesses ?? []).map((w, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-red-500" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Separator />

                  {/* Reasoning (collapsible) */}
                  <div>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-sm font-medium"
                      onClick={() => setShowReasoning((v) => !v)}
                    >
                      Agent Reasoning
                      {showReasoning ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                    {showReasoning && (
                      <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                        {feedback.reasoning}
                      </p>
                    )}
                  </div>
                </>
              ) : sub.status === "evaluating" ? (
                <EvaluatingProgressCard submissionId={id} />
              ) : (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No agent evaluation available yet.
                </div>
              )}

              {/* Review History */}
              {reviews && reviews.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Review History</h3>
                    {reviews.map((review) => (
                      <div
                        key={review.id}
                        className="rounded-md border p-3 text-sm space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">
                            {review.decision}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.created_at).toLocaleString()}
                          </span>
                        </div>
                        {review.score_override != null && (
                          <p className="text-muted-foreground">
                            Score override: {review.score_override}
                          </p>
                        )}
                        {review.feedback && (
                          <p className="text-muted-foreground">
                            {review.feedback}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Bottom action bar */}
      {!isFinalized && feedback && (
        <div className="border-t bg-background px-8 py-4">
          <div className="flex items-center gap-3">
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleDecision("approve")}
              disabled={submitReview.isPending}
            >
              <CheckCircle className="size-4" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDecision("reject")}
              disabled={submitReview.isPending}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
            <Button
              variant="outline"
              className="border-orange-300 text-orange-600 hover:bg-orange-50"
              onClick={handleReEvaluate}
              disabled={submitReview.isPending}
            >
              <RotateCcw className="size-4" />
              Re-evaluate
            </Button>
            {showFeedbackInput && (
              <div className="flex flex-1 items-center gap-2">
                <Textarea
                  placeholder="Provide feedback for re-evaluation..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="min-h-10 flex-1"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

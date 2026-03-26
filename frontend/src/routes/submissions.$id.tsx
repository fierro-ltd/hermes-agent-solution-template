import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { StatusBadge } from "@/components/status-badge";
import {
  useSubmission,
  useSubmissionReviews,
  useSubmitReview,
} from "@/api/hooks";
import {
  CheckCircle,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
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

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: submission, isLoading } = useSubmission(id);
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

  if (!submission) {
    return (
      <div className="p-8 text-muted-foreground">Submission not found.</div>
    );
  }

  const isFinalized =
    submission.status === "approved" || submission.status === "rejected";
  // Find the review that contains actual agent feedback (the grading review).
  // After approval/rejection the latest_review may be the decision record which
  // has no agent_feedback, so we search all reviews for one with feedback.
  const latestReview = (submission as any).latest_review;
  const allReviewSources = [
    latestReview,
    ...(reviews ?? []),
  ].filter(Boolean);

  let feedback: { suggested_score: number; strengths: string[]; weaknesses: string[]; reasoning: string } | null = null;
  for (const r of allReviewSources) {
    if (r?.agent_feedback) {
      try {
        const parsed = typeof r.agent_feedback === "string"
          ? JSON.parse(r.agent_feedback)
          : r.agent_feedback;
        // Verify it actually has the expected shape
        if (parsed && Array.isArray(parsed.strengths) && Array.isArray(parsed.weaknesses)) {
          feedback = parsed;
          break;
        }
      } catch { /* invalid JSON, try next */ }
    }
  }

  // Also check the submission-level agent_feedback field
  if (!feedback && submission.agent_feedback) {
    const af = submission.agent_feedback;
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
            <h1 className="text-xl font-bold">{submission.title}</h1>
            <p className="text-sm text-muted-foreground">
              by {submission.student_name}
            </p>
          </div>
        </div>
        <StatusTimeline status={submission.status} />
      </div>

      {/* Split panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Submission content (60%) */}
        <div className="w-3/5 border-r">
          <ScrollArea className="h-full">
            <div className="p-8">
              <h2 className="text-lg font-semibold mb-4">
                Submission Content
              </h2>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {submission.content}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right panel — Agent evaluation (40%) */}
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
                        {submission.final_score ?? "--"}
                      </span>
                    </div>
                    {submission.professor_notes && (
                      <div>
                        <span className="text-sm font-medium">
                          Professor Notes
                        </span>
                        <p className="text-sm text-muted-foreground mt-1">
                          {submission.professor_notes}
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
                          {feedback.score}
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
              ) : (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  {submission.status === "evaluating"
                    ? "Agent is currently evaluating this submission..."
                    : "No agent evaluation available yet."}
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

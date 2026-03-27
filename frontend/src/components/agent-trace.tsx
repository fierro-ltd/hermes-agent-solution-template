import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentTrace as AgentTraceType, TraceStep } from "@/api/types";

interface AgentTraceProps {
  trace: AgentTraceType;
}

function StepDot({ type }: { type: TraceStep["type"] }) {
  const colors: Record<string, string> = {
    reasoning: "bg-blue-500",
    tool_call: "bg-purple-500",
    tool_result: "bg-purple-400",
    message: "bg-green-500",
  };
  return (
    <div
      className={`absolute -left-[23px] top-1 size-3 rounded-full ${colors[type] ?? "bg-gray-400"}`}
    />
  );
}

function ToolBadge() {
  return (
    <span className="inline-flex items-center rounded bg-purple-500/10 px-1.5 py-0.5 text-[11px] font-medium text-purple-400">
      tool
    </span>
  );
}

function TraceStepRow({ step }: { step: TraceStep }) {
  return (
    <div className="relative mb-4 last:mb-0">
      <StepDot type={step.type} />
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm">
          {(step.type === "tool_call" || step.type === "tool_result") && (
            <>
              <ToolBadge />
              <span className="font-medium">{step.name}</span>
            </>
          )}
          {step.type === "message" && (
            <span className="text-green-500 font-medium">Final assessment composed</span>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {step.timestamp.toFixed(1)}s
        </span>
      </div>
      {step.type === "reasoning" && step.content && (
        <p className="mt-1 text-sm text-foreground">
          {step.content.length > 150
            ? step.content.slice(0, 150) + "..."
            : step.content}
        </p>
      )}
      {step.type === "tool_call" && step.args && (
        <p className="mt-1 text-xs text-muted-foreground">
          {JSON.stringify(step.args).slice(0, 200)}
        </p>
      )}
      {step.type === "tool_result" && step.output && (
        <p className="mt-1 text-xs text-green-600">
          {step.output.length > 100
            ? step.output.slice(0, 100) + "..."
            : step.output}
        </p>
      )}
    </div>
  );
}

export function AgentTrace({ trace }: AgentTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!trace || !trace.steps || trace.steps.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setIsExpanded(v => !v)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <CardTitle className="text-sm font-medium">Agent Trace</CardTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {trace.steps.length} steps
            </span>
            {trace.tools_used.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {trace.tools_used.length} tools
              </span>
            )}
            {trace.usage.total_tokens > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {trace.usage.total_tokens.toLocaleString()} tokens
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {trace.duration_seconds.toFixed(1)}s total
          </span>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="border-l-2 border-border pl-5 ml-1">
            {trace.steps.map((step, i) => (
              <TraceStepRow key={i} step={step} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

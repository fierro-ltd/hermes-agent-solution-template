import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentTrace as AgentTraceType, TraceStep } from "@/api/types";

interface AgentTraceProps {
  trace: AgentTraceType;
}

function stepLabel(step: TraceStep): string {
  if (step.type === "message") return "Final assessment";
  if (step.type === "tool_call") return `Tool: ${step.name}`;
  if (step.type === "tool_result") return `Result: ${step.name}`;
  // reasoning — use first line or first ~60 chars
  const text = step.content || "";
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine || "Reasoning";
}

function StepDot({ type }: { type: TraceStep["type"] }) {
  const colors: Record<string, string> = {
    reasoning: "bg-blue-500",
    tool_call: "bg-purple-500",
    tool_result: "bg-purple-400",
    message: "bg-green-500",
  };
  return (
    <span className={`inline-block size-2.5 rounded-full shrink-0 ${colors[type] ?? "bg-gray-400"}`} />
  );
}

function AccordionStep({ step }: { step: TraceStep }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    (step.type === "reasoning" && step.content && step.content.length > 60) ||
    (step.type === "tool_call" && step.args) ||
    (step.type === "tool_result" && step.output);

  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        <StepDot type={step.type} />
        <span className="text-sm font-medium flex-1 truncate">
          {stepLabel(step)}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {step.timestamp.toFixed(1)}s
        </span>
        {hasDetails && (
          open
            ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && hasDetails && (
        <div className="px-3 pb-3 pl-8 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {step.type === "reasoning" && step.content}
          {step.type === "tool_call" && step.args && (
            <code className="block bg-muted/50 rounded p-2 text-[11px]">
              {JSON.stringify(step.args, null, 2).slice(0, 500)}
            </code>
          )}
          {step.type === "tool_result" && step.output}
        </div>
      )}
    </div>
  );
}

export function AgentTrace({ trace }: AgentTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!trace || !trace.steps || trace.steps.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setIsExpanded((v) => !v)}>
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
        <CardContent className="pt-0 px-0">
          <div className="border-t">
            {trace.steps.map((step, i) => (
              <AccordionStep key={i} step={step} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

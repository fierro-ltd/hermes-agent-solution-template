import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StreamingPanelProps {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

export function StreamingPanel({ text, isStreaming, error }: StreamingPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  if (!text && !isStreaming && !error) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isStreaming && (
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-green-500" />
              </span>
            )}
            <CardTitle className="text-sm font-medium">
              {isStreaming ? "Agent is evaluating..." : "Agent response"}
            </CardTitle>
          </div>
          {isStreaming && (
            <span className="text-xs text-muted-foreground">streaming response</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isStreaming && !text && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" />
            <span className="text-sm">Waiting for agent response...</span>
          </div>
        )}
        {text && (
          <div ref={scrollRef} className="max-h-64 overflow-y-auto rounded-md bg-muted/50 p-4 text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
        {error && (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

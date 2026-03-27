import { useEffect, useRef, useState } from "react";

interface StreamState {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

export function useSubmissionStream(
  submissionId: string,
  status: string,
): StreamState {
  const [state, setState] = useState<StreamState>({
    text: "",
    isStreaming: false,
    error: null,
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (status !== "evaluating" || !submissionId) {
      return;
    }

    setState({ text: "", isStreaming: true, error: null });

    const es = new EventSource(`/api/submissions/${submissionId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "delta" && data.content) {
          setState((prev) => ({
            ...prev,
            text: prev.text + data.content,
          }));
        } else if (data.type === "done") {
          setState((prev) => ({ ...prev, isStreaming: false }));
          es.close();
        } else if (data.type === "error") {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            error: data.message,
          }));
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: prev.text ? null : "Connection lost",
      }));
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [submissionId, status]);

  return state;
}

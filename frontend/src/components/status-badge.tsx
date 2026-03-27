import { Badge } from "@/components/ui/badge";
import type { SubmissionStatus } from "@/api/types";

const statusConfig: Record<
  SubmissionStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  evaluating: {
    label: "Evaluating",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  review: {
    label: "Review",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStats } from "@/api/hooks";
import { FileText, Clock, CheckCircle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data: stats, isLoading } = useStats();

  const cards = [
    {
      title: "Total Submissions",
      value: stats?.total_submissions ?? 0,
      icon: FileText,
      color: "text-blue-600",
    },
    {
      title: "Pending Reviews",
      value: stats?.pending_reviews ?? 0,
      icon: Clock,
      color: "text-yellow-600",
    },
    {
      title: "Approved",
      value: stats?.approved ?? 0,
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      title: "Average Score",
      value:
        stats?.average_score != null
          ? stats.average_score.toFixed(1)
          : "--",
      icon: TrendingUp,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      {isLoading ? (
        <div className="text-muted-foreground">Loading stats...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className={`size-5 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

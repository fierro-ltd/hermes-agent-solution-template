import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import {
  useStats,
  useSubmissions,
  useCreateSubmission,
  useDeleteSubmission,
} from "@/api/hooks";
import {
  Layers,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  AlertCircle,
  Eye,
  Trash2,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

type SortField = "title" | "student_name" | "status" | "final_score" | "created_at";
type SortDir = "asc" | "desc";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Sample submissions for quick testing
// ---------------------------------------------------------------------------

const SAMPLE_SUBMISSIONS = [
  {
    label: "Math — Algebra Exam",
    title: "Algebra II — Midterm Exam",
    student_name: "Carlos Mendez",
    content: `Question 1: Solve for x: 3x² - 12x + 9 = 0

Answer: Using the quadratic formula where a=3, b=-12, c=9:
x = (12 ± √(144-108)) / 6 = (12 ± √36) / 6 = (12 ± 6) / 6
So x = 3 or x = 1. I can verify: 3(9)-12(3)+9 = 27-36+9 = 0 and 3(1)-12(1)+9 = 0

Question 2: Simplify the expression: (2x³y²)³ / (4x²y)²

Answer: Numerator: 8x⁹y⁶. Denominator: 16x⁴y². Result: 8x⁹y⁶ / 16x⁴y² = x⁵y⁴/2

Question 3: A ball is thrown upward with initial velocity 20 m/s. Its height is h(t) = -5t² + 20t. When does it reach maximum height and what is that height?

Answer: Maximum height occurs at t = -b/2a = -20/(2×-5) = 2 seconds. h(2) = -5(4) + 20(2) = -20 + 40 = 20 meters. The ball reaches 20m at 2 seconds.`,
  },
  {
    label: "English — Grammar & Composition",
    title: "English Composition — Grammar Assessment",
    student_name: "Sarah Johnson",
    content: `Question 1: Identify and correct the grammatical errors in the following paragraph:
"Me and my friend went to the store yesterday. We buyed some groceries and than we go to the park. Neither of the dogs were on a leash. Everyone need to follow the rules."

Answer: "My friend and I went to the store yesterday. We bought some groceries and then we went to the park. Neither of the dogs was on a leash. Everyone needs to follow the rules."
Corrections: (1) "Me and my friend" to "My friend and I" (subject pronoun), (2) "buyed" to "bought" (irregular past tense), (3) "than" to "then" (temporal, not comparative), (4) "go" to "went" (past tense consistency), (5) "were" to "was" (neither takes singular verb), (6) "need" to "needs" (everyone is singular).

Question 2: Write a thesis statement for an essay about the impact of social media on teenagers.

Answer: While social media provides teenagers with unprecedented opportunities for self-expression and global connectivity, its pervasive influence on mental health, attention span, and social development demands that parents and educators implement structured digital literacy programs.

Question 3: Explain the difference between active and passive voice. Provide an example of each.

Answer: Active voice: the subject performs the action ("The cat chased the mouse"). Passive voice: the subject receives the action ("The mouse was chased by the cat"). Active voice is generally preferred in writing because it is more direct and concise, though passive voice is useful when the actor is unknown or less important than the action.`,
  },
  {
    label: "Spanish History — Colonial Period",
    title: "Historia de Espana — Periodo Colonial",
    student_name: "Ana Torres",
    content: `Pregunta 1: Describa las principales consecuencias de la llegada de Colon a America en 1492 para Espana y para los pueblos indigenas.

Respuesta: La llegada de Colon tuvo consecuencias profundas para ambos lados. Para Espana, significo el inicio de un vasto imperio colonial que trajo enorme riqueza a traves del oro, la plata y el comercio. Espana se convirtio en la potencia dominante de Europa durante el siglo XVI. Para los pueblos indigenas, las consecuencias fueron devastadoras: epidemias de enfermedades europeas como la viruela diezmaron poblaciones enteras, se impuso un sistema de encomiendas que explotaba la mano de obra indigena, y se destruyeron gran parte de sus estructuras culturales y religiosas.

Pregunta 2: Que fue el sistema de encomiendas y como funcionaba?

Respuesta: El sistema de encomiendas fue una institucion colonial espanola que asignaba grupos de indigenas a colonos espanoles (encomenderos). Los encomenderos recibian el derecho al tributo y al trabajo de los indigenas a cambio de su supuesta proteccion y evangelizacion cristiana. En la practica, funcionaba como un sistema de trabajo forzado que causo abusos generalizados.`,
  },
];

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: submissionsData, isLoading: subsLoading } = useSubmissions();
  const submissions = submissionsData?.submissions;
  const createSubmission = useCreateSubmission();
  const deleteSubmission = useDeleteSubmission();
  const navigate = useNavigate();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [studentName, setStudentName] = useState("");
  const [content, setContent] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    return [...submissions].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "student_name":
          cmp = a.student_name.localeCompare(b.student_name);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "final_score":
          cmp = (a.final_score ?? -1) - (b.final_score ?? -1);
          break;
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [submissions, sortField, sortDir]);

  function loadSample(index: number) {
    const sample = SAMPLE_SUBMISSIONS[index];
    setTitle(sample.title);
    setStudentName(sample.student_name);
    setContent(sample.content);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !studentName.trim() || !content.trim()) return;
    createSubmission.mutate(
      {
        title: title.trim(),
        student_name: studentName.trim(),
        content: content.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Submission created successfully");
          setTitle("");
          setStudentName("");
          setContent("");
          setShowForm(false);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this submission?")) return;
    deleteSubmission.mutate(id, {
      onSuccess: () => {
        toast.success("Submission deleted");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  }

  // Compute card values
  const total = stats?.total ?? 0;
  const completed = stats?.completed ?? 0;
  const failed = stats?.failed ?? 0;
  const pendingReviews = stats?.pending_reviews ?? 0;
  const avgScore = stats?.avg_score;
  const avgProcessing = stats?.avg_processing_seconds;

  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;

  const statCards = [
    {
      title: "Total Submissions",
      value: total,
      subtitle: `${total} total`,
      icon: Layers,
      iconColor: "text-blue-500",
    },
    {
      title: "Completed",
      value: completed,
      subtitle: `${successRate}% success rate`,
      icon: CheckCircle,
      iconColor: "text-green-500",
    },
    {
      title: "Failed",
      value: failed,
      subtitle: `${failureRate}% failure rate`,
      icon: XCircle,
      iconColor: "text-red-500",
    },
    {
      title: "Avg Processing",
      value: avgProcessing != null ? `${Math.round(avgProcessing)}s` : "--",
      subtitle: "avg time to review",
      icon: Clock,
      iconColor: "text-orange-500",
    },
    {
      title: "Avg Score",
      value: avgScore != null ? avgScore.toFixed(1) : "--",
      subtitle: "suggested score avg",
      icon: TrendingUp,
      iconColor: "text-purple-500",
    },
    {
      title: "Pending Reviews",
      value: pendingReviews,
      subtitle: "awaiting professor",
      icon: AlertCircle,
      iconColor: "text-yellow-500",
    },
  ];

  return (
    <div className="p-8 space-y-8">
      {/* Analytics Header */}
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Grading performance</p>
      </div>

      {/* Stat Cards */}
      {statsLoading ? (
        <div className="text-muted-foreground">Loading stats...</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {statCards.map((card) => (
            <Card key={card.title} className="relative">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {card.title}
                </CardTitle>
                <card.icon className={`size-4 ${card.iconColor}`} />
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {card.subtitle}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Submissions Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Submissions
            </h2>
            <p className="text-sm text-muted-foreground">
              Latest grading activity
            </p>
          </div>
          <Button onClick={() => setShowForm((v) => !v)} size="sm">
            {showForm ? (
              <X className="size-4" />
            ) : (
              <Plus className="size-4" />
            )}
            {showForm ? "Cancel" : "Upload Submission"}
          </Button>
        </div>

        {/* Upload Form */}
        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>New Submission</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs text-muted-foreground self-center mr-1">
                  Load sample:
                </span>
                {SAMPLE_SUBMISSIONS.map((sample, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => loadSample(i)}
                    className="text-xs px-3 py-1.5 rounded-full border hover:bg-muted transition-colors"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="title" className="text-sm font-medium">
                      Title
                    </label>
                    <Input
                      id="title"
                      placeholder="Assignment title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="student" className="text-sm font-medium">
                      Student Name
                    </label>
                    <Input
                      id="student"
                      placeholder="Student name"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="content" className="text-sm font-medium">
                    Submission Content
                  </label>
                  <Textarea
                    id="content"
                    placeholder="Paste submission text here..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-32"
                    required
                  />
                </div>
                <Button type="submit" disabled={createSubmission.isPending}>
                  {createSubmission.isPending ? "Submitting..." : "Submit"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Submissions Table */}
        {subsLoading ? (
          <div className="text-muted-foreground">Loading submissions...</div>
        ) : !submissions?.length ? (
          <div className="text-muted-foreground text-center py-12">
            No submissions yet. Upload one to get started.
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {([
                    { field: "title" as SortField, label: "Title", align: "left" },
                    { field: "student_name" as SortField, label: "Student", align: "left" },
                    { field: "status" as SortField, label: "Status", align: "left" },
                    { field: "final_score" as SortField, label: "Score", align: "left" },
                    { field: "created_at" as SortField, label: "Created", align: "left" },
                  ]).map((col) => {
                    const SortIcon = sortField === col.field
                      ? (sortDir === "asc" ? ArrowUp : ArrowDown)
                      : ArrowUpDown;
                    return (
                      <th
                        key={col.field}
                        className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                        onClick={() => toggleSort(col.field)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          <SortIcon className={`size-3 ${sortField === col.field ? "text-foreground" : ""}`} />
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSubmissions.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() =>
                      void navigate({
                        to: "/submissions/$id",
                        params: { id: sub.id },
                      })
                    }
                  >
                    <td className="px-4 py-3 text-sm font-medium">
                      {sub.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {sub.student_name}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {sub.final_score != null ? sub.final_score : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateTime(sub.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void navigate({
                              to: "/submissions/$id",
                              params: { id: sub.id },
                            });
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => handleDelete(sub.id, e)}
                          disabled={deleteSubmission.isPending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

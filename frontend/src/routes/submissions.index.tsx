import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { useSubmissions, useCreateSubmission } from "@/api/hooks";
import { Plus, Eye, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/submissions/")({
  component: SubmissionsPage,
});

const SAMPLE_SUBMISSIONS = [
  {
    label: "Math — Algebra Exam",
    title: "Algebra II — Midterm Exam",
    student_name: "Carlos Mendez",
    content: `Question 1: Solve for x: 3x² - 12x + 9 = 0

Answer: Using the quadratic formula where a=3, b=-12, c=9:
x = (12 ± √(144-108)) / 6 = (12 ± √36) / 6 = (12 ± 6) / 6
So x = 3 or x = 1. I can verify: 3(9)-12(3)+9 = 27-36+9 = 0 ✓ and 3(1)-12(1)+9 = 0 ✓

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
Corrections: (1) "Me and my friend" → "My friend and I" (subject pronoun), (2) "buyed" → "bought" (irregular past tense), (3) "than" → "then" (temporal, not comparative), (4) "go" → "went" (past tense consistency), (5) "were" → "was" (neither takes singular verb), (6) "need" → "needs" (everyone is singular).

Question 2: Write a thesis statement for an essay about the impact of social media on teenagers.

Answer: While social media provides teenagers with unprecedented opportunities for self-expression and global connectivity, its pervasive influence on mental health, attention span, and social development demands that parents and educators implement structured digital literacy programs.

Question 3: Explain the difference between active and passive voice. Provide an example of each.

Answer: Active voice: the subject performs the action ("The cat chased the mouse"). Passive voice: the subject receives the action ("The mouse was chased by the cat"). Active voice is generally preferred in writing because it is more direct and concise, though passive voice is useful when the actor is unknown or less important than the action.`,
  },
  {
    label: "Spanish History — Colonial Period",
    title: "Historia de España — Período Colonial",
    student_name: "Ana Lucía Torres",
    content: `Pregunta 1: Describa las principales consecuencias de la llegada de Colón a América en 1492 para España y para los pueblos indígenas.

Respuesta: La llegada de Colón tuvo consecuencias profundas para ambos lados. Para España, significó el inicio de un vasto imperio colonial que trajo enorme riqueza a través del oro, la plata y el comercio. España se convirtió en la potencia dominante de Europa durante el siglo XVI. Para los pueblos indígenas, las consecuencias fueron devastadoras: epidemias de enfermedades europeas como la viruela diezmaron poblaciones enteras, se impuso un sistema de encomiendas que explotaba la mano de obra indígena, y se destruyeron gran parte de sus estructuras culturales y religiosas.

Pregunta 2: ¿Qué fue el sistema de encomiendas y cómo funcionaba?

Respuesta: El sistema de encomiendas fue una institución colonial española que asignaba grupos de indígenas a colonos españoles (encomenderos). Los encomenderos recibían el derecho al tributo y al trabajo de los indígenas a cambio de su supuesta protección y evangelización cristiana. En la práctica, funcionaba como un sistema de trabajo forzado que causó abusos generalizados. Fray Bartolomé de las Casas fue uno de los principales críticos del sistema y abogó por los derechos de los indígenas ante la Corona española.

Pregunta 3: Explique la importancia del Tratado de Tordesillas (1494).

Respuesta: El Tratado de Tordesillas dividió el Nuevo Mundo entre España y Portugal mediante una línea imaginaria a 370 leguas al oeste de las islas de Cabo Verde. Las tierras al oeste de esta línea serían para España y las del este para Portugal. Esto explica por qué Brasil habla portugués mientras el resto de Latinoamérica habla español. El tratado fue mediado por el Papa Alejandro VI y aunque fue respetado por ambas potencias ibéricas, fue ignorado por otras potencias europeas como Inglaterra y Francia.`,
  },
];

function SubmissionsPage() {
  const { data, isLoading } = useSubmissions();
  const submissions = data?.submissions;
  const createSubmission = useCreateSubmission();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [studentName, setStudentName] = useState("");
  const [content, setContent] = useState("");

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
      { title: title.trim(), student_name: studentName.trim(), content: content.trim() },
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Submissions</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showForm ? "Cancel" : "Upload Submission"}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New Submission</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs text-muted-foreground self-center mr-1">Load sample:</span>
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
              <Button
                type="submit"
                disabled={createSubmission.isPending}
              >
                {createSubmission.isPending ? "Submitting..." : "Submit"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
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
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Student
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() =>
                    void navigate({ to: "/submissions/$id", params: { id: sub.id } })
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
                    {new Date(sub.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
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
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

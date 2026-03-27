# Image Submission Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image upload support so professors can submit scanned exam photos for AI grading via Hermes vision.

**Architecture:** Extend the existing submission pipeline — DB gets a `content_type` column, API detects image uploads and saves to disk, worker base64-encodes images into multipart OpenAI messages for Hermes vision, frontend shows image previews in upload form and image viewer on detail page.

**Tech Stack:** FastAPI (file upload), asyncpg (DB), Hermes OpenAI-compatible API (vision), React + Tailwind + shadcn/ui (frontend), Vite (static asset import)

**Spec:** `docs/2026-03-27-image-submission-support-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `infra/shared/init-db.sql` | Add `content_type` column to submissions |
| Modify | `services/api/routes/submissions.py` | Image upload handling, new `/image` endpoint, multipart SSE |
| Modify | `services/api/schemas.py` | Add `content_type` to response model |
| Modify | `services/workers/activities/grading.py` | Build multipart vision messages for Hermes |
| Create | `sample_data/exams/examen-01.jpeg` | Copy UTN exam image 1 |
| Create | `sample_data/exams/examen-02.png` | Copy UTN exam image 2 |
| Create | `sample_data/exams/examen-03.png` | Copy UTN exam image 3 |
| Modify | `frontend/src/api/types.ts` | Add `content_type` to Submission interface |
| Modify | `frontend/src/api/hooks.ts` | Update `useCreateSubmission` for file uploads |
| Modify | `frontend/src/routes/dashboard.tsx` | Image samples, Smart Content Area, drag-drop |
| Modify | `frontend/src/routes/submissions.$id.tsx` | Image viewer in left panel |

---

### Task 1: Database Schema — Add content_type Column

**Files:**
- Modify: `infra/shared/init-db.sql:10-23`

- [ ] **Step 1: Add content_type column to init-db.sql**

In `infra/shared/init-db.sql`, add `content_type` column and constraint to the `CREATE TABLE submissions` statement:

```sql
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    student_name TEXT NOT NULL,
    content TEXT,
    file_path TEXT,
    content_type TEXT NOT NULL DEFAULT 'text',
    status TEXT NOT NULL DEFAULT 'pending',
    workflow_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN (
        'pending', 'evaluating', 'review', 'approved', 'rejected', 'expired'
    )),
    CONSTRAINT valid_content_type CHECK (content_type IN ('text', 'image'))
);
```

- [ ] **Step 2: Commit**

```bash
git add infra/shared/init-db.sql
git commit -m "feat(db): add content_type column to submissions table"
```

---

### Task 2: Copy Sample Exam Images

**Files:**
- Create: `sample_data/exams/examen-01.jpeg`
- Create: `sample_data/exams/examen-02.png`
- Create: `sample_data/exams/examen-03.png`

- [ ] **Step 1: Copy exam images from Downloads**

```bash
mkdir -p sample_data/exams
cp ~/Downloads/examen-01.jpeg sample_data/exams/
cp ~/Downloads/examen-02.png sample_data/exams/
cp ~/Downloads/examen-03.png sample_data/exams/
```

- [ ] **Step 2: Commit**

```bash
git add sample_data/exams/
git commit -m "feat: add UTN exam sample images for image submission testing"
```

---

### Task 3: API — Image Upload & Serving

**Files:**
- Modify: `services/api/routes/submissions.py:35-100` (create_submission)
- Modify: `services/api/routes/submissions.py:139-170` (get_submission)
- Modify: `services/api/routes/submissions.py:314-401` (stream)
- Modify: `services/api/schemas.py:30-38` (SubmissionResponse)

- [ ] **Step 1: Update SubmissionResponse schema**

In `services/api/schemas.py`, add `content_type` to `SubmissionResponse`:

```python
class SubmissionResponse(BaseModel):
    """Response body for a submission."""

    id: uuid.UUID
    title: str
    student_name: str
    status: str
    content_type: str = "text"
    created_at: datetime
    workflow_id: str | None = None
```

- [ ] **Step 2: Update create_submission to handle image uploads**

In `services/api/routes/submissions.py`, replace the `create_submission` function:

```python
import mimetypes
from pathlib import Path
from starlette.responses import StreamingResponse, JSONResponse, FileResponse

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads")


@router.post("", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    title: str = Form(...),
    student_name: str = Form(...),
    content: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
) -> SubmissionResponse:
    """Upload a new submission (text, file, or image), persist it, and kick off grading."""
    if not content and not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either 'content' (text) or 'file'.",
        )

    submission_id = uuid.uuid4()
    submission_content = content or ""
    content_type = "text"
    file_path = None

    if file:
        raw = await file.read()
        mime = file.content_type or ""
        if mime in IMAGE_MIME_TYPES:
            # Save image to disk
            content_type = "image"
            ext = mimetypes.guess_extension(mime) or ".jpg"
            if ext == ".jpe":
                ext = ".jpg"
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            file_path = f"{submission_id}{ext}"
            full_path = os.path.join(UPLOAD_DIR, file_path)
            with open(full_path, "wb") as f:
                f.write(raw)
            # content holds optional notes for image submissions
            submission_content = content or ""
        else:
            # Non-image file: decode as text (existing behavior)
            submission_content = raw.decode("utf-8", errors="replace")

    pool = await deps.get_pool()

    row = await pool.fetchrow(
        """
        INSERT INTO submissions (id, title, student_name, content, file_path, content_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING id, title, student_name, status, content_type, created_at, workflow_id
        """,
        submission_id,
        title,
        student_name,
        submission_content,
        file_path,
        content_type,
    )

    # Start the Temporal grading workflow
    temporal = await deps.get_temporal_client()
    workflow_id = f"grading-{submission_id}"

    from services.workers.schemas import GradingParams

    await temporal.start_workflow(
        "GradingWorkflow",
        GradingParams(submission_id=str(submission_id)),
        id=workflow_id,
        task_queue=GRADING_TASK_QUEUE,
        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
    )

    await pool.execute(
        "UPDATE submissions SET workflow_id = $1, status = 'evaluating' WHERE id = $2",
        workflow_id,
        submission_id,
    )

    return SubmissionResponse(
        id=submission_id,
        title=title,
        student_name=student_name,
        status="evaluating",
        content_type=content_type,
        created_at=row["created_at"],
        workflow_id=workflow_id,
    )
```

- [ ] **Step 3: Update get_submission to include content_type**

In `get_submission`, update the SELECT query to include `content_type` and `file_path`:

```python
@router.get("/{submission_id}", response_model=dict[str, Any])
async def get_submission(submission_id: uuid.UUID) -> dict[str, Any]:
    """Get a single submission with its latest review."""
    pool = await deps.get_pool()

    row = await pool.fetchrow(
        """
        SELECT id, title, student_name, content, content_type, file_path, status, created_at, workflow_id
        FROM submissions WHERE id = $1
        """,
        submission_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")

    submission = dict(row)

    # Fetch latest review
    review_row = await pool.fetchrow(
        """
        SELECT id, submission_id, agent_feedback, suggested_score, final_score,
               professor_notes, decision, created_at, updated_at
        FROM reviews
        WHERE submission_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        submission_id,
    )

    submission["latest_review"] = dict(review_row) if review_row else None
    return submission
```

- [ ] **Step 4: Add GET /api/submissions/{id}/image endpoint**

Add after the `get_submission_trace` endpoint:

```python
@router.get("/{submission_id}/image")
async def get_submission_image(submission_id: uuid.UUID):
    """Serve the image file for an image submission."""
    pool = await deps.get_pool()
    row = await pool.fetchrow(
        "SELECT file_path, content_type FROM submissions WHERE id = $1",
        submission_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found")
    if row["content_type"] != "image" or not row["file_path"]:
        raise HTTPException(status_code=404, detail="No image for this submission")

    full_path = os.path.join(UPLOAD_DIR, row["file_path"])
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(full_path)
```

- [ ] **Step 5: Update SSE stream to support image submissions**

In `stream_submission_evaluation`, update the query and message building:

```python
@router.get("/{submission_id}/stream")
async def stream_submission_evaluation(submission_id: uuid.UUID):
    """SSE endpoint that proxies Hermes streaming response to the frontend."""
    pool = await deps.get_pool()

    sub = await pool.fetchrow(
        "SELECT id, content, content_type, file_path, status FROM submissions WHERE id = $1",
        submission_id,
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub["status"] != "evaluating":
        raise HTTPException(status_code=400, detail="Submission is not being evaluated")

    rubric_row = await pool.fetchrow(
        "SELECT value FROM app_settings WHERE key = 'rubric'"
    )
    rubric_text = ""
    if rubric_row:
        try:
            rubric = _json.loads(rubric_row["value"])
            rubric_text = _json.dumps(rubric, indent=2)
        except Exception:
            rubric_text = str(rubric_row["value"])

    system_prompt = (
        "You are an expert academic grading assistant. "
        "Evaluate the following student submission against the rubric.\n\n"
        f"RUBRIC:\n{rubric_text}\n"
    )

    # Build user message — multipart for images, plain text otherwise
    if sub["content_type"] == "image" and sub["file_path"]:
        import base64
        full_path = os.path.join(UPLOAD_DIR, sub["file_path"])
        with open(full_path, "rb") as f:
            img_data = base64.b64encode(f.read()).decode("ascii")
        ext = os.path.splitext(sub["file_path"])[1].lower()
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
        mime = mime_map.get(ext, "image/jpeg")
        user_content = [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_data}"}},
        ]
        if sub["content"]:
            user_content.append({"type": "text", "text": sub["content"]})
    else:
        user_content = sub["content"]

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    hermes_url = os.environ.get("HERMES_API_URL", "http://hermes-gateway:8642")
    hermes_key = os.environ.get("HERMES_API_KEY", "")

    headers_dict = {"Content-Type": "application/json"}
    if hermes_key:
        headers_dict["Authorization"] = f"Bearer {hermes_key}"

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{hermes_url}/v1/chat/completions",
                    json={"model": "hermes-agent", "messages": messages, "stream": True},
                    headers=headers_dict,
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = _json.loads(data)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content")
                            if content:
                                yield f"data: {_json.dumps({'type': 'delta', 'content': content})}\n\n"
                        except Exception:
                            continue
        except Exception as e:
            import logging
            logging.getLogger(__name__).error("SSE stream error: %s", e, exc_info=True)
            yield f"data: {_json.dumps({'type': 'error', 'message': 'Streaming failed'})}\n\n"
        finally:
            yield f"data: {_json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 6: Update list_submissions query to include content_type**

In `list_submissions`, add `content_type` to the SELECT:

```python
rows = await pool.fetch(
    """
    SELECT id, title, student_name, status, content_type, created_at, workflow_id
    FROM submissions
    ORDER BY created_at DESC
    OFFSET $1 LIMIT $2
    """,
    offset,
    limit,
)
```

- [ ] **Step 7: Commit**

```bash
git add services/api/routes/submissions.py services/api/schemas.py
git commit -m "feat(api): support image uploads, serving, and multipart SSE streaming"
```

---

### Task 4: Worker — Vision Message Building

**Files:**
- Modify: `services/workers/activities/grading.py:300-453` (evaluate_submission)

- [ ] **Step 1: Update evaluate_submission to handle image content**

In `services/workers/activities/grading.py`, update the `evaluate_submission` activity. Replace the DB query and message-building section:

```python
@activity.defn
async def evaluate_submission(
    submission_id: str,
    professor_feedback: str | None = None,
) -> dict:
    """Call the Hermes AI agent to evaluate a student submission."""
    activity.logger.info("Evaluating submission %s", submission_id)

    pool = await _get_db_pool()

    # Fetch submission content and type from DB
    row = await pool.fetchrow(
        "SELECT content, content_type, file_path FROM submissions WHERE id = $1",
        submission_id,
    )
    if not row:
        raise ApplicationError(
            f"Submission {submission_id} not found",
            non_retryable=True,
        )
    content = row["content"]
    content_type = row.get("content_type", "text")
    file_path = row.get("file_path")

    # Fetch rubric from app_settings
    rubric = await pool.fetchval(
        "SELECT value FROM app_settings WHERE key = 'rubric'"
    ) or ""

    # Read provider/model settings from the database
    provider_settings = await _get_provider_settings(pool)
    model = provider_settings["model"]
    api_key = provider_settings["api_key"]

    activity.logger.info(
        "Using model=%s provider=%s for submission %s (content_type=%s)",
        model,
        provider_settings["provider"] or "(default)",
        submission_id,
        content_type,
    )

    system_prompt = _build_system_prompt(rubric, professor_feedback)

    # Build user message — multipart for images, plain text otherwise
    if content_type == "image" and file_path:
        import base64
        upload_dir = os.environ.get("UPLOAD_DIR", "/app/uploads")
        full_path = os.path.join(upload_dir, file_path)
        with open(full_path, "rb") as f:
            img_data = base64.b64encode(f.read()).decode("ascii")
        ext = os.path.splitext(file_path)[1].lower()
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
        mime = mime_map.get(ext, "image/jpeg")
        user_content: str | list = [
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_data}"}},
        ]
        if content:
            user_content.append({"type": "text", "text": content})
    else:
        user_content = content

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.3,
    }

    start_time = _time.time()
    trace_data: dict | None = None
    raw_content: str = ""

    try:
        heartbeat_task = asyncio.create_task(_heartbeat_loop())
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{HERMES_API_URL}/v1/responses",
                    json={
                        "input": payload["messages"],
                        "model": payload.get("model", "hermes-agent"),
                        "temperature": payload.get("temperature", 0.3),
                    },
                    headers=headers,
                )
        finally:
            heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat_task

        if response.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"Hermes /v1/responses returned {response.status_code}",
                request=response.request, response=response,
            )

        resp_json = response.json()
        output_items = resp_json.get("output", [])
        usage = resp_json.get("usage", {})
        session_id = resp_json.get("id", "")
        trace_data = _extract_trace(output_items, usage, session_id, start_time, model)

        for item in reversed(output_items):
            if item.get("type") == "message":
                raw_content = _extract_content_text(item.get("content", ""))
                break
        if not raw_content:
            raw_content = resp_json.get("output_text", "")

    except ApplicationError:
        raise
    except Exception as e:
        activity.logger.warning(
            "Failed to use /v1/responses for %s, falling back to chat/completions: %s",
            submission_id, e,
        )
        heartbeat_task = asyncio.create_task(_heartbeat_loop())
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    f"{HERMES_API_URL}/v1/chat/completions",
                    json=payload, headers=headers,
                )
        finally:
            heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat_task

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if 400 <= status_code < 500 and status_code != 429:
                raise ApplicationError(f"LLM request failed: HTTP {status_code}", non_retryable=True) from exc
            if status_code == 429:
                retry_after = exc.response.headers.get("retry-after")
                delay = None
                if retry_after:
                    try:
                        delay = timedelta(seconds=min(int(retry_after), 60))
                    except ValueError:
                        pass
                raise ApplicationError("Rate limited (429)", non_retryable=False, next_retry_delay=delay) from exc
            raise

        raw_content = response.json()["choices"][0]["message"]["content"]
        trace_data = None

    if not raw_content:
        raise ApplicationError("Empty response from Hermes", non_retryable=True)

    feedback = _parse_agent_response(raw_content)
    activity.logger.info("Submission %s evaluated: score=%.1f", submission_id, feedback.suggested_score)

    feedback_dict = {
        "suggested_score": feedback.suggested_score,
        "strengths": feedback.strengths,
        "weaknesses": feedback.weaknesses,
        "reasoning": feedback.reasoning,
    }
    return {"feedback": feedback_dict, "trace": trace_data}
```

- [ ] **Step 2: Commit**

```bash
git add services/workers/activities/grading.py
git commit -m "feat(worker): build multipart vision messages for image submissions"
```

---

### Task 5: Frontend — Types & Hooks

**Files:**
- Modify: `frontend/src/api/types.ts:26-38`
- Modify: `frontend/src/api/hooks.ts:146-171`

- [ ] **Step 1: Add content_type to Submission type**

In `frontend/src/api/types.ts`, add `content_type` and `file_path` to the `Submission` interface:

```typescript
export interface Submission {
  id: string;
  title: string;
  student_name: string;
  content: string;
  content_type: "text" | "image";
  file_path: string | null;
  status: SubmissionStatus;
  workflow_id: string | null;
  agent_feedback: AgentFeedback | null;
  final_score: number | null;
  professor_notes: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Update useCreateSubmission hook to support file uploads**

In `frontend/src/api/hooks.ts`, update `useCreateSubmission`:

```typescript
export function useCreateSubmission() {
  const getToken = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      student_name: string;
      content?: string;
      file?: File;
    }) => {
      const token = await getToken();
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("student_name", data.student_name);
      if (data.content) {
        formData.append("content", data.content);
      }
      if (data.file) {
        formData.append("file", data.file);
      }
      return fetchJSON<Submission>(
        "/api/submissions",
        { method: "POST", body: formData },
        token,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["submissions"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/api/types.ts src/api/hooks.ts && cd ..
git commit -m "feat(frontend): update types and hooks for image submission support"
```

---

### Task 6: Frontend — Dashboard Upload Form with Image Support

**Files:**
- Modify: `frontend/src/routes/dashboard.tsx`

- [ ] **Step 1: Add image sample data and update SAMPLE_SUBMISSIONS**

Replace the `SAMPLE_SUBMISSIONS` array and add image sample imports at the top of `dashboard.tsx`:

```typescript
import examImg01 from "../../../../sample_data/exams/examen-01.jpeg";
import examImg02 from "../../../../sample_data/exams/examen-02.png";
import examImg03 from "../../../../sample_data/exams/examen-03.png";
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
  FileText,
  Camera,
  Upload,
  Image as ImageIcon,
} from "lucide-react";

// ...

type SampleSubmission =
  | { type: "text"; label: string; title: string; student_name: string; content: string }
  | { type: "image"; label: string; title: string; student_name: string; imageSrc: string; fileName: string };

const SAMPLE_SUBMISSIONS: SampleSubmission[] = [
  {
    type: "text",
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
    type: "text",
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
    type: "text",
    label: "Spanish History — Colonial Period",
    title: "Historia de Espana — Periodo Colonial",
    student_name: "Ana Torres",
    content: `Pregunta 1: Describa las principales consecuencias de la llegada de Colon a America en 1492 para Espana y para los pueblos indigenas.

Respuesta: La llegada de Colon tuvo consecuencias profundas para ambos lados. Para Espana, significo el inicio de un vasto imperio colonial que trajo enorme riqueza a traves del oro, la plata y el comercio. Espana se convirtio en la potencia dominante de Europa durante el siglo XVI. Para los pueblos indigenas, las consecuencias fueron devastadoras: epidemias de enfermedades europeas como la viruela diezmaron poblaciones enteras, se impuso un sistema de encomiendas que explotaba la mano de obra indigena, y se destruyeron gran parte de sus estructuras culturales y religiosas.

Pregunta 2: Que fue el sistema de encomiendas y como funcionaba?

Respuesta: El sistema de encomiendas fue una institucion colonial espanola que asignaba grupos de indigenas a colonos espanoles (encomenderos). Los encomenderos recibian el derecho al tributo y al trabajo de los indigenas a cambio de su supuesta proteccion y evangelizacion cristiana. En la practica, funcionaba como un sistema de trabajo forzado que causo abusos generalizados.`,
  },
  {
    type: "image",
    label: "Mec. Fluidos — UTN",
    title: "Mecánica de los Fluidos — 1° Parcial",
    student_name: "Matías Magallanos",
    imageSrc: examImg01,
    fileName: "examen-01.jpeg",
  },
  {
    type: "image",
    label: "Ing. Mecánica B — UTN",
    title: "Ingeniería Mecánica B — Examen",
    student_name: "Nasello Cuonatto",
    imageSrc: examImg02,
    fileName: "examen-02.png",
  },
  {
    type: "image",
    label: "Elem. Máquinas — UTN",
    title: "Elementos de Máquinas — Evaluación Práctica",
    student_name: "Federico Wagner",
    imageSrc: examImg03,
    fileName: "examen-03.png",
  },
];
```

- [ ] **Step 2: Update form state and handlers for image support**

In the `DashboardPage` component, update the state and handlers:

```typescript
function DashboardPage() {
  // ... existing state ...
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");

  function loadSample(index: number) {
    const sample = SAMPLE_SUBMISSIONS[index];
    setTitle(sample.title);
    setStudentName(sample.student_name);
    if (sample.type === "text") {
      setContent(sample.content);
      setImageFile(null);
      setImagePreview(null);
      setImageName("");
    } else {
      setContent("");
      setImagePreview(sample.imageSrc);
      setImageName(sample.fileName);
      // Fetch the image src to create a File object for upload
      fetch(sample.imageSrc)
        .then((r) => r.blob())
        .then((blob) => {
          const ext = sample.fileName.split(".").pop() ?? "jpeg";
          const mime = ext === "png" ? "image/png" : "image/jpeg";
          setImageFile(new File([blob], sample.fileName, { type: mime }));
        });
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (JPEG, PNG, or WebP)");
      return;
    }
    setImageFile(file);
    setImageName(file.name);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    setImageName("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !studentName.trim()) return;
    if (!content.trim() && !imageFile) return;
    createSubmission.mutate(
      {
        title: title.trim(),
        student_name: studentName.trim(),
        content: content.trim() || undefined,
        file: imageFile || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Submission created successfully");
          setTitle("");
          setStudentName("");
          setContent("");
          removeImage();
          setShowForm(false);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  // ... rest of component ...
```

- [ ] **Step 3: Update the form JSX — sample buttons with icons and Smart Content Area**

Replace the upload form Card content in the JSX:

```tsx
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
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border hover:bg-muted transition-colors"
          >
            {sample.type === "text" ? (
              <FileText className="size-3" />
            ) : (
              <Camera className="size-3" />
            )}
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

        {/* Smart Content Area */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Submission Content
          </label>
          {imagePreview ? (
            <div className="rounded-lg border overflow-hidden">
              <div className="relative bg-muted/30 p-4 flex flex-col items-center gap-2">
                <img
                  src={imagePreview}
                  alt="Exam preview"
                  className="max-h-48 rounded object-contain"
                />
                <div className="text-xs text-muted-foreground">
                  {imageName}
                </div>
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600 transition-colors"
                >
                  <X className="size-3" />
                </button>
              </div>
              <div className="p-3 border-t">
                <Textarea
                  placeholder="Add notes for the grader (optional)..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-16 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                id="content"
                placeholder="Paste submission text here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-32"
              />
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="size-3" />
                  Attach image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
                <span className="text-xs text-muted-foreground">
                  or drag & drop an image above
                </span>
              </div>
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={createSubmission.isPending || (!content.trim() && !imageFile)}
        >
          {createSubmission.isPending ? "Submitting..." : "Submit"}
        </Button>
      </form>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/routes/dashboard.tsx && cd ..
git commit -m "feat(frontend): add image samples and Smart Content Area to upload form"
```

---

### Task 7: Frontend — Job Detail Image Viewer

**Files:**
- Modify: `frontend/src/routes/submissions.$id.tsx:366-387`

- [ ] **Step 1: Update left panel to show image viewer for image submissions**

Replace the left panel content area in `submissions.$id.tsx`:

```tsx
{/* Left panel -- Submission content (60%) */}
<div className="w-3/5 border-r">
  <ScrollArea className="h-full">
    <div className="p-8">
      <h2 className="text-lg font-semibold mb-4">
        Submission Content
      </h2>
      {sub.status === "evaluating" && (
        <div className="mb-6">
          <StreamingPanel
            text={streamState.text}
            isStreaming={streamState.isStreaming}
            error={streamState.error}
          />
        </div>
      )}
      {sub.content_type === "image" ? (
        <div className="space-y-4">
          <div className="rounded-lg border overflow-hidden bg-muted/20">
            <img
              src={`/api/submissions/${id}/image`}
              alt={`${sub.title} — exam image`}
              className="w-full cursor-zoom-in"
              onClick={(e) => {
                const img = e.currentTarget;
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  img.requestFullscreen();
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Click image to view fullscreen
          </p>
          {sub.content && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-2 text-muted-foreground">
                Notes
              </h3>
              <p className="text-sm whitespace-pre-wrap">
                {sub.content}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
          {sub.content}
        </div>
      )}
    </div>
  </ScrollArea>
</div>
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/routes/submissions.\$id.tsx && cd ..
git commit -m "feat(frontend): add image viewer to submission detail page"
```

---

### Task 8: Vite Config — Static Asset Support for Sample Images

**Files:**
- Modify: `frontend/vite.config.ts` (if needed)

- [ ] **Step 1: Verify Vite handles image imports**

Vite handles static image imports natively (JPEG, PNG, etc.) — no config changes needed. The imports in dashboard.tsx (`import examImg01 from "../../../../sample_data/exams/examen-01.jpeg"`) will be bundled as static assets automatically.

Run the dev server to verify:

```bash
cd frontend && pnpm dev
```

Expected: No import errors. The sample images load in the browser.

- [ ] **Step 2: Commit (only if changes were needed)**

If no changes needed, skip this step.

---

### Task 9: Integration Verification

- [ ] **Step 1: Rebuild Docker containers**

```bash
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               down -v
docker compose -f infra/shared/docker-compose.yml \
               -f infra/local/docker-compose.override.yml \
               up --build -d
```

The `-v` flag removes volumes to re-initialize the database with the new `content_type` column.

- [ ] **Step 2: Test image submission flow**

1. Open http://localhost:8000/dashboard
2. Click "Upload Submission"
3. Click the "Mec. Fluidos — UTN" image sample button
4. Verify: Title, Student Name are populated; image preview shows
5. Click Submit
6. Verify: Submission appears in table with status "evaluating"
7. Click into the submission
8. Verify: Left panel shows the exam image (not text)
9. Verify: Streaming panel shows agent evaluation in real-time
10. Wait for evaluation to complete
11. Verify: Agent feedback, strengths, weaknesses, and trace appear
12. Repeat for the other 2 image samples

- [ ] **Step 3: Test text submission still works**

1. Click "Upload Submission"
2. Click "Math — Algebra Exam" text sample
3. Verify: Textarea is shown with content (not image preview)
4. Submit and verify the full flow works as before

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: image submission support — complete implementation"
```

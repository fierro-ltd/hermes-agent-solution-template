# Image Submission Support — Design Spec

## Overview

Add image upload support to the exam grading system. Professors can submit scanned exam photos (JPEG/PNG/WebP) alongside the existing text submissions. The Hermes agent uses its vision tool (OpenRouter Gemini 3.1 Flash Lite) to analyze the images and grade them against the rubric.

The interaction model is **image-first with optional text**: the image is the primary content, with an optional notes field for context. The existing text-only flow is unchanged.

## Sample Data

Three scanned UTN (Universidad Tecnológica Nacional) exams are bundled as sample data:

| File | Subject | Student | Format |
|------|---------|---------|--------|
| `sample_data/exams/examen-01.jpeg` | Mecánica de los Fluidos — 1° Parcial | Matías Magallanos | JPEG, ~90 KB |
| `sample_data/exams/examen-02.png` | Ingeniería Mecánica B — Multiple Choice | Nasello Cuonatto | PNG, ~438 KB |
| `sample_data/exams/examen-03.png` | Elementos de Máquinas — Evaluación Práctica | Federico Wagner | PNG, ~1 MB |

These appear in the upload form alongside the 3 existing text samples.

## Data Model & Storage

### Database

- **New column:** `submissions.content_type TEXT NOT NULL DEFAULT 'text'` — values: `'text'` or `'image'`
- **Existing column used:** `submissions.file_path TEXT` — path to saved image in uploads volume
- **Existing column:** `submissions.content TEXT` — for text submissions (full content) or image submissions (optional notes)
- **No other schema changes.** `file_path` and `UPLOAD_DIR` config already exist.

### File Storage

- Images saved to `/app/uploads/{submission_id}.{ext}` (shared Docker volume between API and worker)
- Supported formats: JPEG, PNG, WebP
- Original file extension preserved

## API Changes

### `POST /api/submissions`

Current behavior: accepts `content` (text) OR `file` (decoded to UTF-8 text). Mutually exclusive.

New behavior:
- Detect image MIME types (`image/jpeg`, `image/png`, `image/webp`) on uploaded files
- For image files: save to `UPLOAD_DIR`, set `file_path` in DB, set `content_type = 'image'`
- Allow both `content` (notes) AND `file` (image) simultaneously for image submissions
- Non-image files continue to be decoded as UTF-8 text (existing behavior)
- Text-only submissions (no file, just `content`) continue unchanged

### `GET /api/submissions/{id}`

- Add `content_type` and `file_path` to `SubmissionResponse` model

### New: `GET /api/submissions/{id}/image`

- Serves the image file from `UPLOAD_DIR` with correct `Content-Type` header
- Auth-protected like all `/api` endpoints
- Returns 404 if no image file exists for the submission

### `GET /api/submissions/{id}/stream` (SSE)

- When `content_type` is `'image'`: build multipart user message with base64 image + optional notes
- When `content_type` is `'text'`: unchanged behavior

## Worker / Hermes Integration

### `evaluate_submission` activity

When `content_type` is `'image'`:
- Read image from `UPLOAD_DIR`, base64-encode it
- Build OpenAI-compatible multipart user message:
  ```python
  {"role": "user", "content": [
      {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,{data}"}},
      {"type": "text", "text": "Student notes: ..."}  # if content is not null
  ]}
  ```
- Same format for both `/v1/responses` and `/v1/chat/completions` endpoints

When `content_type` is `'text'`: unchanged behavior.

### No Hermes-side changes

- Vision tool already enabled in `config.yaml`
- SOUL.md already instructs the agent to use vision for images/diagrams
- No changes to Hermes configuration or persona

## Frontend Changes

### Dashboard — Upload Form

**Sample buttons (single row with icons):**
- All 6 samples in one row of pill buttons
- Text samples: document icon prefix (existing 3: Math, English, Spanish History)
- Image samples: camera icon prefix (new 3: Mec. Fluidos, Ing. Mecánica B, Elem. Máquinas)
- Image sample data (title, student_name, image file) defined alongside existing text samples
- Image files imported as static assets from `sample_data/exams/`

**Smart Content Area:**
- Default state: textarea (existing behavior for text submissions)
- When image is loaded (via sample or manual upload):
  - Textarea replaced by image preview (filename, size, thumbnail)
  - "Remove" button to clear image and return to textarea mode
  - Small optional notes textarea appears below the preview
- "Attach image" button and/or drag-and-drop overlay on the content area
- Accepts JPEG, PNG, WebP files
- Form fields always present: Title (text input), Student Name (text input) at top

**Submit behavior:**
- Text submissions: `FormData` with `content` field (existing)
- Image submissions: `FormData` with `file` field (image blob) + optional `content` field (notes)

### Job Detail — Left Panel

- Check `content_type` from submission API response
- `'text'`: render in `<pre>` block (existing behavior)
- `'image'`: render responsive image from `/api/submissions/{id}/image`
  - Click to zoom/fullscreen
  - If `content` (notes) exists, display below the image in a smaller text block

### Job Detail — Right Panel

No changes. Agent feedback, trace accordion, review controls, and streaming panel all work identically regardless of content type.

## Migration

**For `init-db.sql` (fresh installs):** Add `content_type` column and constraint directly to the `CREATE TABLE submissions` statement.

**For existing running instances:** Single SQL migration:
```sql
ALTER TABLE submissions ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE submissions ADD CONSTRAINT valid_content_type
    CHECK (content_type IN ('text', 'image'));
```

Existing rows default to `'text'`. No backfill needed.

## Out of Scope

- Multi-image submissions (one image per submission for now)
- PDF support
- OCR/text extraction from images (Hermes vision handles this directly)
- Image compression or resizing on upload

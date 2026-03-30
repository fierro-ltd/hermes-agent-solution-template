"""Hermes Agent introspection endpoints — reads from shared volume."""

import json
import os
import re
import sqlite3
import threading
import time
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/hermes", tags=["hermes"])

HERMES_HOME = Path(os.environ.get("HERMES_HOME", "/root/.hermes"))

# Thread-safe read-only SQLite connection
_db_lock = threading.Lock()
_db_conn: sqlite3.Connection | None = None


def _get_db() -> sqlite3.Connection:
    global _db_conn
    if _db_conn is None:
        db_path = HERMES_HOME / "state.db"
        if not db_path.exists():
            raise HTTPException(status_code=503, detail="Hermes state.db not found")
        uri = f"file:{db_path}?mode=ro"
        _db_conn = sqlite3.connect(uri, uri=True, check_same_thread=False, timeout=10.0)
        _db_conn.row_factory = sqlite3.Row
        _db_conn.execute("PRAGMA journal_mode=WAL")
    return _db_conn


# --- Sessions ---


@router.get("/sessions")
async def list_sessions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    source: str | None = None,
):
    """List Hermes sessions with message previews."""
    with _db_lock:
        db = _get_db()
        source_clause = "WHERE s.source = ?" if source else ""
        params: list = []
        if source:
            params.append(source)
        params.extend([limit, offset])
        rows = db.execute(
            f"""
            SELECT s.*,
                COALESCE(
                    (SELECT SUBSTR(REPLACE(REPLACE(m.content, X'0A', ' '), X'0D', ' '), 1, 80)
                     FROM messages m
                     WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL
                     ORDER BY m.timestamp, m.id LIMIT 1),
                    ''
                ) AS preview,
                COALESCE(
                    (SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.session_id = s.id),
                    s.started_at
                ) AS last_active
            FROM sessions s
            {source_clause}
            ORDER BY s.started_at DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()
        total = db.execute(
            f"SELECT COUNT(*) FROM sessions {'WHERE source = ?' if source else ''}",
            [source] if source else [],
        ).fetchone()[0]
    sessions = [dict(r) for r in rows]
    return {"sessions": sessions, "total": total}


@router.get("/sessions/stats")
async def session_stats():
    """Aggregate session statistics."""
    with _db_lock:
        db = _get_db()
        total = db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        by_source = db.execute(
            "SELECT source, COUNT(*) as count FROM sessions GROUP BY source"
        ).fetchall()
        by_model = db.execute(
            "SELECT model, COUNT(*) as count FROM sessions WHERE model IS NOT NULL GROUP BY model"
        ).fetchall()
        tokens = db.execute(
            "SELECT COALESCE(SUM(input_tokens),0) as input,"
            " COALESCE(SUM(output_tokens),0) as output FROM sessions"
        ).fetchone()
        cost = db.execute(
            "SELECT COALESCE(SUM(estimated_cost_usd),0) as estimated,"
            " COALESCE(SUM(actual_cost_usd),0) as actual FROM sessions"
        ).fetchone()
    return {
        "total_sessions": total,
        "by_source": [dict(r) for r in by_source],
        "by_model": [dict(r) for r in by_model],
        "total_input_tokens": tokens["input"],
        "total_output_tokens": tokens["output"],
        "estimated_cost_usd": cost["estimated"],
        "actual_cost_usd": cost["actual"],
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session detail with all messages."""
    with _db_lock:
        db = _get_db()
        row = db.execute("SELECT * FROM sessions WHERE id = ?", [session_id]).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        messages = db.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp, id",
            [session_id],
        ).fetchall()
    session = dict(row)
    msg_list = []
    for m in messages:
        md = dict(m)
        if md.get("tool_calls"):
            try:
                md["tool_calls"] = json.loads(md["tool_calls"])
            except (json.JSONDecodeError, TypeError):
                pass
        msg_list.append(md)
    session["messages"] = msg_list
    return session


# --- Search ---


@router.get("/search")
async def search_messages(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Full-text search across all Hermes messages."""
    with _db_lock:
        db = _get_db()
        try:
            rows = db.execute(
                """
                SELECT
                    m.id, m.session_id, m.role,
                    snippet(messages_fts, 0, '>>>', '<<<', '...', 40) AS snippet,
                    m.timestamp, m.tool_name, s.source, s.model,
                    s.started_at AS session_started
                FROM messages_fts
                JOIN messages m ON m.id = messages_fts.rowid
                JOIN sessions s ON s.id = m.session_id
                WHERE messages_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                [q, limit],
            ).fetchall()
        except sqlite3.OperationalError:
            return {"results": [], "error": "FTS5 not available"}
    return {"results": [dict(r) for r in rows]}


# --- Gateway Status ---


@router.get("/gateway")
async def gateway_status():
    """Read Hermes gateway state."""
    state_path = HERMES_HOME / "gateway_state.json"
    if not state_path.exists():
        return {"running": False, "platforms": []}
    try:
        data = json.loads(state_path.read_text())
    except (json.JSONDecodeError, OSError):
        return {"running": False, "platforms": []}
    # Check if PID is alive
    pid = data.get("pid")
    running = False
    if pid:
        try:
            os.kill(pid, 0)
            running = True
        except (OSError, ProcessLookupError):
            pass
    platforms = data.get("platforms", [])
    uptime = None
    start_time = data.get("updated_at") or data.get("start_time")
    if start_time and running:
        uptime = time.time() - start_time
    return {
        "running": running,
        "pid": pid,
        "uptime_seconds": uptime,
        "platforms": platforms,
        "raw": data,
    }


# --- Config ---


@router.get("/config")
async def get_config():
    """Read Hermes config.yaml (secrets masked)."""
    config_path = HERMES_HOME / "config.yaml"
    if not config_path.exists():
        return {"config": {}, "raw": ""}
    raw = config_path.read_text()
    try:
        config = yaml.safe_load(raw) or {}
    except yaml.YAMLError:
        return {"config": {}, "raw": raw}
    # Mask secrets
    secret_pattern = re.compile(
        r"(api_key|token|secret|password|credential|private_key)", re.IGNORECASE
    )

    def mask_dict(d):  # type: ignore[no-untyped-def]
        if isinstance(d, dict):
            return {
                k: (
                    "****"
                    if secret_pattern.search(k) and isinstance(v, str)
                    else mask_dict(v)
                )
                for k, v in d.items()
            }
        if isinstance(d, list):
            return [mask_dict(i) for i in d]
        return d

    return {"config": mask_dict(config), "raw": raw}


@router.get("/soul")
async def get_soul():
    """Read SOUL.md persona file."""
    soul_path = HERMES_HOME / "SOUL.md"
    if not soul_path.exists():
        return {"content": "", "exists": False}
    return {"content": soul_path.read_text(), "exists": True}


# --- Skills ---


@router.get("/skills")
async def list_skills():
    """List all Hermes skills from the skills directory."""
    skills_dir = HERMES_HOME / "skills"
    if not skills_dir.exists():
        return {"skills": [], "total": 0}
    skills = []
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        skill: dict = {"name": entry.name, "tools": [], "has_description": False}
        # Check for description files
        for desc_name in ("SKILL.md", "DESCRIPTION.md", "README.md"):
            desc_file = entry / desc_name
            if desc_file.exists():
                skill["has_description"] = True
                skill["description_file"] = desc_name
                # Read first 200 chars as preview
                skill["description_preview"] = desc_file.read_text()[:200]
                break
        # Count Python tool files
        py_files = list(entry.glob("*.py"))
        skill["tool_count"] = len(py_files)
        skill["tools"] = [f.stem for f in py_files]
        skills.append(skill)
    return {"skills": skills, "total": len(skills)}


@router.get("/skills/{skill_name}")
async def get_skill_detail(skill_name: str):
    """Get detailed info about a specific skill."""
    skill_dir = HERMES_HOME / "skills" / skill_name
    if not skill_dir.exists():
        raise HTTPException(status_code=404, detail="Skill not found")
    result: dict = {"name": skill_name, "files": [], "description": ""}
    # Read description
    for desc_name in ("SKILL.md", "DESCRIPTION.md", "README.md"):
        desc_file = skill_dir / desc_name
        if desc_file.exists():
            result["description"] = desc_file.read_text()
            break
    # List all files
    for f in sorted(skill_dir.rglob("*")):
        if f.is_file():
            rel = f.relative_to(skill_dir)
            entry: dict = {"path": str(rel), "size": f.stat().st_size}
            # Read Python files (tool implementations)
            if f.suffix == ".py" and f.stat().st_size < 50000:
                entry["content"] = f.read_text()
            result["files"].append(entry)
    return result

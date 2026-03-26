-- Create application database and user (executed by postgres superuser during init)
CREATE USER app_user WITH PASSWORD 'app_password';
CREATE DATABASE app_db OWNER app_user;

-- Connect to app_db and create schema
\c app_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    student_name TEXT NOT NULL,
    content TEXT,
    file_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    workflow_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN (
        'pending', 'evaluating', 'review', 'approved', 'rejected', 'expired'
    ))
);

CREATE INDEX submissions_status_idx ON submissions (status);
CREATE INDEX submissions_student_name_idx ON submissions (student_name);
CREATE INDEX submissions_created_at_idx ON submissions (created_at DESC);

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    agent_feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
    suggested_score NUMERIC(5,2),
    final_score NUMERIC(5,2),
    professor_notes TEXT,
    decision TEXT NOT NULL DEFAULT 'pending_review',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_decision CHECK (decision IN (
        'pending_review', 'approved', 'rejected', 're_evaluate'
    ))
);

CREATE INDEX reviews_submission_id_idx ON reviews (submission_id);
CREATE INDEX reviews_decision_idx ON reviews (decision);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES ('rubric', '{
    "name": "Default Grading Rubric",
    "max_score": 100,
    "criteria": [
        {
            "name": "Content & Accuracy",
            "weight": 40,
            "description": "Correctness of facts, depth of analysis, and relevance to the prompt."
        },
        {
            "name": "Structure & Organization",
            "weight": 25,
            "description": "Logical flow, clear paragraphs, introduction and conclusion."
        },
        {
            "name": "Critical Thinking",
            "weight": 20,
            "description": "Original insights, evaluation of multiple perspectives, evidence-based reasoning."
        },
        {
            "name": "Writing Quality",
            "weight": 15,
            "description": "Grammar, clarity, academic tone, proper citations."
        }
    ]
}');
INSERT INTO app_settings (key, value) VALUES ('grading_instructions', '');
INSERT INTO app_settings (key, value) VALUES ('max_score', '100');
INSERT INTO app_settings (key, value) VALUES ('hermes_model', 'glm-5');

-- ---------------------------------------------------------------------------
-- better-auth tables (user, session, account, verification)
-- ---------------------------------------------------------------------------

CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    image TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session (
    id TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    token TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user"(id)
);

CREATE TABLE account (
    id TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id),
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    scope TEXT,
    password TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ
);

-- Grant permissions to app_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user;

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { betterAuth } from "better-auth";
import { Pool } from "pg";

const port = Number(process.env.PORT || 3100);

const trustedOrigins = [
  "http://localhost:5173",
  "http://localhost:8000",
];

const extraOrigins = process.env.CORS_ORIGINS?.split(",").filter(Boolean) ?? [];
trustedOrigins.push(...extraOrigins);

const auth = betterAuth({
  database: new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://app_user:app_password@localhost:5432/app_db",
  }),
  secret: process.env.AUTH_SECRET || "dev-secret-change-in-production",
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  },
  trustedOrigins,
});

const app = new Hono();

// CORS for frontend
app.use(
  "*",
  cors({
    origin: trustedOrigins,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// All better-auth routes
app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

serve({ fetch: app.fetch, port }, () => {
  console.log(`Auth service running on port ${port}`);
});

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  Timer,
  UserCheck,
  Settings2,
  ShieldCheck,
  BarChart3,
  ArrowRight,
  Github,
  Container,
  Wrench,
  Zap,
  CheckCircle2,
  Radio,
  ScanSearch,
  MessageSquare,
} from "lucide-react";
import { MermaidDiagram } from "@/components/mermaid-diagram";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const STATS = [
  { value: "9", label: "Containers" },
  { value: "30+", label: "Hermes Tools" },
  { value: "3", label: "AI Tool Types" },
  { value: "100%", label: "Durable Execution" },
];

const CAPABILITIES = [
  {
    icon: Bot,
    title: "AI Agent Evaluation",
    description:
      "Hermes Agent evaluates content against configurable rubrics with 30+ built-in tools including web search, file operations, and vision",
  },
  {
    icon: Radio,
    title: "Real-Time Streaming",
    description:
      "Watch the AI agent evaluate in real time with SSE streaming — see the live response as it is generated",
  },
  {
    icon: ScanSearch,
    title: "Agent Trace Visibility",
    description:
      "Inspect every reasoning step, tool call, timestamp, and token usage in a collapsible accordion trace view",
  },
  {
    icon: MessageSquare,
    title: "LibreChat Integration",
    description:
      "Interactive chat UI connected directly to Hermes Agent for freeform conversations and exploration",
  },
  {
    icon: Timer,
    title: "Durable Workflows",
    description:
      "Temporal ensures workflows survive crashes, retries, and long human review periods",
  },
  {
    icon: UserCheck,
    title: "Human-in-the-Loop",
    description:
      "Professors review AI output, approve, reject, or request re-evaluation",
  },
  {
    icon: Settings2,
    title: "Configurable Providers",
    description:
      "Switch between OpenRouter, OpenCode Go, Anthropic, and other LLM providers",
  },
  {
    icon: ShieldCheck,
    title: "Self-Hosted Auth",
    description:
      "better-auth with email/password, Google, and GitHub OAuth — no vendor lock-in",
  },
  {
    icon: BarChart3,
    title: "Sortable Dashboard",
    description:
      "Track submissions and reviews with date+time timestamps and a fully sortable dashboard table",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Submit",
    description: "Upload student submissions via the web UI or API",
  },
  {
    number: "2",
    title: "Evaluate",
    description:
      "Hermes Agent grades against your rubric via SSE streaming — watch reasoning steps and tool calls appear live",
  },
  {
    number: "3",
    title: "Review",
    description:
      "Professor reviews AI feedback with full agent trace: reasoning steps, tool calls, timestamps, and token usage",
  },
  {
    number: "4",
    title: "Approve",
    description: "One click to approve, reject, or request re-evaluation",
  },
];

const ARCHITECTURE_CHART = `graph TB
    subgraph Client["Client"]
        Browser["Browser\n(React SPA)"]
    end
    subgraph Docker["Docker Compose (9 containers)"]
        subgraph App["Application"]
            API["FastAPI\n:8000"]
            Auth["better-auth\n:3100"]
            Worker["Temporal\nWorker"]
        end
        subgraph Infra["Infrastructure"]
            Temporal["Temporal\nServer"]
            Hermes["Hermes\nAgent"]
            Postgres["PostgreSQL"]
            Mongo["MongoDB"]
            LibreChat["LibreChat\n:3000"]
        end
    end
    Browser -->|REST| API
    Browser -->|SSE stream| API
    Browser --> Auth
    Browser -->|Chat UI| LibreChat
    API --> Temporal
    API --> Postgres
    Auth --> Postgres
    Worker --> Temporal
    Worker -->|v1/responses| Hermes
    Worker --> Postgres
    Hermes -->|agent_trace| Postgres
    LibreChat --> Hermes
    LibreChat --> Mongo
    Hermes --> LLM["LLM Provider\n(web / file / vision)"]`;

const TECH_STACK = [
  { name: "React 19", role: "Frontend" },
  { name: "FastAPI", role: "Backend" },
  { name: "Temporal", role: "Orchestration" },
  { name: "Hermes Agent", role: "AI Agent (web / file / vision)" },
  { name: "PostgreSQL", role: "Relational Database" },
  { name: "MongoDB", role: "Document Store" },
  { name: "LibreChat", role: "Chat UI" },
  { name: "Tavily", role: "Web Search" },
  { name: "better-auth", role: "Authentication" },
  { name: "Docker Compose", role: "Infrastructure" },
  { name: "Caddy", role: "Reverse Proxy" },
];

const GITHUB_URL =
  "https://github.com/fierro-ltd/hermes-agent-solution-template";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function HomePage() {
  return (
    <div>
      {/* ----------------------------------------------------------------- */}
      {/* Section 1: Hero */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-20 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 text-center">
          <p className="tracking-[0.2em] text-xs text-muted-foreground uppercase mb-4">
            Hermes Agent Solution Template
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-6">
            AI Agent Workflows with
            <br />
            Durable Orchestration
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            A production-ready template for building AI agent workflows with
            human-in-the-loop review. Powered by Hermes Agent, Temporal, and
            React.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-8 py-3 font-medium hover:opacity-90 transition-opacity"
            >
              Try the Demo
              <ArrowRight className="size-4" />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-border rounded-full px-8 py-3 font-medium hover:bg-muted transition-colors"
            >
              <Github className="size-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: Stats Strip */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-20 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl md:text-4xl font-bold mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 3: Capabilities */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-20 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-12">
            <p className="tracking-[0.2em] text-xs text-muted-foreground uppercase mb-3">
              Capabilities
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">
              What You Can Build
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="border border-border rounded-lg p-5 bg-card"
              >
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <cap.icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{cap.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 4: How It Works */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-20 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-12">
            <p className="tracking-[0.2em] text-xs text-muted-foreground uppercase mb-3">
              How It Works
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">
              Four Simple Steps
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="border border-border rounded-lg p-5 bg-card text-center"
              >
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-sm font-bold text-primary">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 5: Architecture Diagram */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-20 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-12">
            <p className="tracking-[0.2em] text-xs text-muted-foreground uppercase mb-3">
              Architecture
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">System Design</h2>
          </div>
          <div className="border border-border rounded-lg p-8 bg-background">
            <MermaidDiagram chart={ARCHITECTURE_CHART} />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 6: Tech Stack */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-20 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-12">
            <p className="tracking-[0.2em] text-xs text-muted-foreground uppercase mb-3">
              Tech Stack
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">Built With</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                className="border border-border rounded-lg p-5 bg-card text-center"
              >
                <h3 className="font-semibold mb-1">{tech.name}</h3>
                <p className="text-sm text-muted-foreground">{tech.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 7: CTA */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-20 bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Build?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Fork the template, customize the rubric, deploy to any cloud
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-8 py-3 font-medium hover:opacity-90 transition-opacity"
          >
            Get Started
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

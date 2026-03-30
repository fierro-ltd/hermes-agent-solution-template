import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  ShieldCheck,
  ArrowRight,
  Github,
  Box,
  Wrench,
  Brain,
  CheckCircle2,
  Radio,
  ScanSearch,
  MessageSquare,
  Timer,
  UserCheck,
  Settings2,
  BarChart3,
} from "lucide-react";
import { MermaidDiagram } from "@/components/mermaid-diagram";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const STATS = [
  { value: "10", label: "Containers", icon: Box },
  { value: "30+", label: "Hermes Tools", icon: Wrench },
  { value: "3", label: "AI Tool Types", icon: Brain },
  { value: "100%", label: "Durable Execution", icon: CheckCircle2 },
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
    subgraph Docker["Docker Compose (10 containers)"]
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
            MC["Mission\nControl"]
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
    Worker -->|tokens| MC
    Worker --> Postgres
    Hermes -->|agent_trace| Postgres
    MC -.->|shared vol| Hermes
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
  { name: "Mission Control", role: "Agent Observability" },
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
      <section className="relative pt-20 pb-32 px-4 sm:px-6 lg:px-8 text-center overflow-hidden hero-radial-bg">
        <div className="absolute inset-0 hero-grid-overlay" />

        <div className="relative z-10 max-w-4xl mx-auto">
          <span className="text-sm font-bold tracking-[0.2em] text-slate-700 uppercase mb-4 block">
            Hermes Agent Solution Template
          </span>
          <h1 className="text-5xl md:text-6xl font-extrabold text-black mb-6 tracking-tight">
            AI Agent Workflows with
            <br />
            Durable Orchestration
          </h1>
          <p className="text-lg md:text-xl text-slate-800 mb-10 max-w-2xl mx-auto font-medium">
            A production-ready template for building AI agent workflows with
            human-in-the-loop review. Powered by Hermes Agent, Temporal, and
            React.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-20">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-gradient-to-r from-indigo-700 to-blue-500 rounded-full hover:opacity-90 shadow-lg transition-all"
            >
              Try the Demo
              <ArrowRight className="size-4 ml-2" />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-slate-900 bg-white/50 backdrop-blur-sm border border-slate-300 rounded-full hover:bg-white/80 shadow-sm transition-all"
            >
              <Github className="size-5 mr-2" />
              View on GitHub
            </a>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center relative"
              >
                <stat.icon className="absolute top-4 right-4 size-3.5 text-indigo-300 opacity-50" />
                <span className="text-4xl font-extrabold text-black mb-2">
                  {stat.value}
                </span>
                <span className="text-sm font-semibold text-slate-700">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: Capabilities */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase mb-2 block">
              Capabilities
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              What You Can Build
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-xl hover:border-indigo-200 transition-all duration-300 group text-center"
              >
                <div className="w-20 h-20 mx-auto bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                  <cap.icon className="size-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">
                  {cap.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 3: How It Works */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase mb-2 block">
              How It Works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Four Simple Steps
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-xl hover:border-indigo-200 transition-all duration-300 group text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                  <span className="text-xl font-extrabold text-indigo-600">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">
                  {step.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 4: Architecture Diagram */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase mb-2 block">
              Architecture
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              System Design
            </h2>
          </div>
          <div className="border border-slate-200 rounded-2xl p-8 bg-slate-50">
            <MermaidDiagram chart={ARCHITECTURE_CHART} />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 5: Tech Stack */}
      {/* ----------------------------------------------------------------- */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase mb-2 block">
              Tech Stack
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Built With
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:border-indigo-200 transition-all duration-300 text-center"
              >
                <h3 className="font-bold text-slate-900 mb-1">{tech.name}</h3>
                <p className="text-sm text-slate-600">{tech.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Section 6: CTA */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative py-32 px-4 sm:px-6 lg:px-8 overflow-hidden hero-radial-bg">
        <div className="absolute inset-0 hero-grid-overlay" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-black mb-4">
            Ready to Build?
          </h2>
          <p className="text-lg text-slate-800 mb-8 font-medium">
            Fork the template, customize the rubric, deploy to any cloud
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-gradient-to-r from-indigo-700 to-blue-500 rounded-full hover:opacity-90 shadow-lg transition-all"
          >
            Get Started
            <ArrowRight className="size-4 ml-2" />
          </Link>
        </div>
      </section>
    </div>
  );
}

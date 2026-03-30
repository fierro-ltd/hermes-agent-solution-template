import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  useHermesSessions,
  useHermesStats,
  useHermesGateway,
  useHermesSkills,
  useHermesSoul,
  useHermesConfig,
} from "@/api/hooks";
import type {
  HermesSession,
  HermesSkill,
} from "@/api/types";
import {
  Activity,
  Cpu,
  MessageSquare,
  Wrench,
  FileText,
  Brain,
  Zap,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/hermes")({
  component: HermesPage,
});

function HermesPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "skills" | "config">("overview");

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Activity },
    { id: "sessions" as const, label: "Sessions", icon: MessageSquare },
    { id: "skills" as const, label: "Skills", icon: Wrench },
    { id: "config" as const, label: "Config & SOUL", icon: FileText },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase mb-2 block">
          Agent Internals
        </span>
        <h1 className="text-3xl font-bold text-slate-900">Hermes Agent</h1>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "text-indigo-600 border-indigo-600"
                : "text-slate-500 border-transparent hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "sessions" && <SessionsTab />}
      {activeTab === "skills" && <SkillsTab />}
      {activeTab === "config" && <ConfigTab />}
    </div>
  );
}

// --- Overview Tab ---
function OverviewTab() {
  const { data: stats, isLoading: statsLoading } = useHermesStats();
  const { data: gateway } = useHermesGateway();
  const { data: skillsData } = useHermesSkills();

  if (statsLoading) return <div className="text-slate-500 py-8">Loading Hermes data...</div>;

  const statCards = [
    { label: "Total Sessions", value: stats?.total_sessions ?? 0, icon: MessageSquare, color: "text-blue-500" },
    { label: "Input Tokens", value: formatNumber(stats?.total_input_tokens ?? 0), icon: Zap, color: "text-purple-500" },
    { label: "Output Tokens", value: formatNumber(stats?.total_output_tokens ?? 0), icon: Zap, color: "text-green-500" },
    { label: "Est. Cost", value: `$${(stats?.estimated_cost_usd ?? 0).toFixed(4)}`, icon: Activity, color: "text-orange-500" },
    { label: "Skills", value: skillsData?.total ?? 0, icon: Wrench, color: "text-indigo-500" },
    { label: "Gateway", value: gateway?.running ? "Online" : "Offline", icon: Cpu, color: gateway?.running ? "text-green-500" : "text-red-400" },
  ];

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-indigo-200 transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{card.label}</span>
              <card.icon className={`size-4 ${card.color}`} />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Model & Source distribution */}
      {stats && (stats.by_model.length > 0 || stats.by_source.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stats.by_model.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Sessions by Model</h3>
              <div className="space-y-3">
                {stats.by_model.map((m) => (
                  <div key={m.model} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{m.model || "unknown"}</span>
                    <span className="text-sm font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{m.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.by_source.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Sessions by Source</h3>
              <div className="space-y-3">
                {stats.by_source.map((s) => (
                  <div key={s.source} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{s.source}</span>
                    <span className="text-sm font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gateway status */}
      {gateway && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Gateway Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase">Status</span>
              <div className={`text-sm font-bold mt-1 ${gateway.running ? "text-green-600" : "text-red-500"}`}>
                {gateway.running ? "Running" : "Stopped"}
              </div>
            </div>
            {gateway.pid && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">PID</span>
                <div className="text-sm font-bold text-slate-900 mt-1">{gateway.pid}</div>
              </div>
            )}
            {gateway.uptime_seconds != null && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Uptime</span>
                <div className="text-sm font-bold text-slate-900 mt-1">{formatUptime(gateway.uptime_seconds)}</div>
              </div>
            )}
            {gateway.platforms.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Platforms</span>
                <div className="flex gap-2 mt-1">
                  {gateway.platforms.map((p) => (
                    <span key={p.name} className={`text-xs px-2 py-0.5 rounded-full ${p.connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sessions Tab ---
function SessionsTab() {
  const { data, isLoading } = useHermesSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <div className="text-slate-500 py-8">Loading sessions...</div>;

  const sessions = data?.sessions ?? [];

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16">
        <MessageSquare className="size-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No sessions yet</h3>
        <p className="text-sm text-slate-500">Hermes sessions will appear here when the agent processes requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-500">{data?.total ?? 0} sessions total</div>
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-500">Session</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-500">Source</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-500">Model</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-500">Messages</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-500">Tools</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-500">Tokens</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-500">Time</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s: HermesSession) => (
              <tr
                key={s.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
              >
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-slate-900">{s.title || s.id.slice(0, 16)}</div>
                  {s.preview && <div className="text-xs text-slate-400 truncate max-w-xs">{s.preview}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{s.source}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{s.model || "\u2014"}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{s.message_count}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{s.tool_call_count}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{formatNumber(s.input_tokens + s.output_tokens)}</td>
                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{formatTimestamp(s.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Skills Tab ---
function SkillsTab() {
  const { data, isLoading } = useHermesSkills();
  const [search, setSearch] = useState("");

  if (isLoading) return <div className="text-slate-500 py-8">Loading skills...</div>;

  const skills = (data?.skills ?? []).filter((s: HermesSkill) =>
    search ? s.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{data?.total ?? 0} skills installed</div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill: HermesSkill) => (
          <div
            key={skill.name}
            className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-indigo-200 transition-all duration-300 group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                <Wrench className="size-5" />
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {skill.tool_count} tool{skill.tool_count !== 1 ? "s" : ""}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">{skill.name}</h3>
            {skill.description_preview && (
              <p className="text-xs text-slate-500 line-clamp-2">{skill.description_preview}</p>
            )}
            {skill.tools.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {skill.tools.slice(0, 4).map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{t}</span>
                ))}
                {skill.tools.length > 4 && (
                  <span className="text-[10px] px-1.5 py-0.5 text-slate-400">+{skill.tools.length - 4}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Config Tab ---
function ConfigTab() {
  const { data: soul } = useHermesSoul();
  const { data: configData } = useHermesConfig();

  return (
    <div className="space-y-6">
      {/* SOUL.md */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="size-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-slate-900">SOUL.md — Agent Persona</h3>
        </div>
        {soul?.exists ? (
          <pre className="bg-slate-800 text-slate-100 rounded-xl p-4 text-sm overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">{soul.content}</pre>
        ) : (
          <p className="text-sm text-slate-500">No SOUL.md file found.</p>
        )}
      </div>

      {/* Config */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="size-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-slate-900">config.yaml</h3>
        </div>
        {configData?.raw ? (
          <pre className="bg-slate-800 text-slate-100 rounded-xl p-4 text-sm overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">{configData.raw}</pre>
        ) : (
          <p className="text-sm text-slate-500">No config.yaml found.</p>
        )}
      </div>
    </div>
  );
}

// --- Helpers ---
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

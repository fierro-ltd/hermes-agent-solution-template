import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSettings, useUpdateSetting } from "@/api/hooks";
import { toast } from "sonner";
import { Save, GraduationCap, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSettingValue(
  settings: Array<{ key: string; value: string }> | undefined,
  key: string,
): string {
  return settings?.find((s) => s.key === key)?.value ?? "";
}

// ---------------------------------------------------------------------------
// Grading tab content
// ---------------------------------------------------------------------------

function GradingTab() {
  const { data: settings, isLoading } = useSettings();
  const updateSetting = useUpdateSetting();

  const [rubric, setRubric] = useState("");
  const [instructions, setInstructions] = useState("");
  const [maxScore, setMaxScore] = useState("");

  useEffect(() => {
    if (settings) {
      setRubric(getSettingValue(settings, "rubric"));
      setInstructions(getSettingValue(settings, "grading_instructions"));
      setMaxScore(getSettingValue(settings, "max_score"));
    }
  }, [settings]);

  function handleSave(key: string, value: string) {
    updateSetting.mutate(
      { key, value },
      {
        onSuccess: () => {
          toast.success(`Setting "${key}" saved successfully`);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  if (isLoading) {
    return <div className="text-slate-500 py-8">Loading grading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">Rubric</CardTitle>
          <CardDescription>
            Define the grading rubric. Markdown formatting is supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            placeholder="Enter grading rubric (supports markdown)..."
            className="min-h-40 font-mono text-sm"
          />
          <Button
            onClick={() => handleSave("rubric", rubric)}
            disabled={updateSetting.isPending}
          >
            <Save className="size-4" />
            Save Rubric
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">Grading Instructions</CardTitle>
          <CardDescription>
            Additional instructions for the AI grading agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter additional grading instructions..."
            className="min-h-32"
          />
          <Button
            onClick={() => handleSave("grading_instructions", instructions)}
            disabled={updateSetting.isPending}
          >
            <Save className="size-4" />
            Save Instructions
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">Max Score</CardTitle>
          <CardDescription>
            The maximum score a submission can receive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="number"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            placeholder="100"
            className="max-w-32"
          />
          <Button
            onClick={() => handleSave("max_score", maxScore)}
            disabled={updateSetting.isPending}
          >
            <Save className="size-4" />
            Save Max Score
          </Button>
        </CardContent>
      </Card>

      {/* Link to Hermes models */}
      <Link
        to="/hermes"
        className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-indigo-200 transition-all duration-300 group"
      >
        <div>
          <h3 className="text-sm font-bold text-slate-900">Configure model providers</h3>
          <p className="text-xs text-slate-500 mt-1">Text model, vision model, and Hermes gateway key</p>
        </div>
        <ArrowRight className="size-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page — tabbed layout (single tab for now, extensible)
// ---------------------------------------------------------------------------

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"grading">("grading");

  const tabs = [
    { id: "grading" as const, label: "Grading", icon: GraduationCap },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase mb-2 block">
          Configuration
        </span>
        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
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
      {activeTab === "grading" && <GradingTab />}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  useSettings,
  useUpdateSetting,
  useProviderConfig,
  useUpdateProviderConfig,
  useRuntimeConfig,
} from "@/api/hooks";
import type { Provider } from "@/api/types";
import { toast } from "sonner";
import { Save, Eye, EyeOff, Info, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

const PROVIDERS: Provider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    env_var: "OPENROUTER_API_KEY",
    enabled: true,
    models: [
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-flash",
      "openai/gpt-4o",
      "meta-llama/llama-4-maverick",
    ],
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    env_var: "OPENCODE_GO_API_KEY",
    enabled: true,
    models: ["glm-5", "kimi-k2.5", "minimax-m2.7", "minimax-m2.5"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    env_var: "ANTHROPIC_API_KEY",
    enabled: false,
    models: [],
  },
  {
    id: "openai",
    name: "OpenAI",
    env_var: "OPENAI_API_KEY",
    enabled: false,
    models: [],
  },
  {
    id: "nous",
    name: "Nous Portal",
    env_var: "",
    enabled: false,
    models: [],
  },
  {
    id: "zai",
    name: "z.ai / GLM",
    env_var: "GLM_API_KEY",
    enabled: false,
    models: [],
  },
  {
    id: "kimi-coding",
    name: "Kimi / Moonshot",
    env_var: "KIMI_API_KEY",
    enabled: false,
    models: [],
  },
  {
    id: "minimax",
    name: "MiniMax",
    env_var: "MINIMAX_API_KEY",
    enabled: false,
    models: [],
  },
  {
    id: "alibaba",
    name: "Alibaba / Qwen",
    env_var: "DASHSCOPE_API_KEY",
    enabled: false,
    models: [],
  },
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    env_var: "OPENCODE_ZEN_API_KEY",
    enabled: false,
    models: [],
  },
];

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
// Provider card sub-component
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  provider: Provider;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function ProviderCard({ provider, isSelected, onSelect }: ProviderCardProps) {
  const disabled = !provider.enabled;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(provider.id)}
      className={`
        w-full text-left rounded-2xl border-2 p-4 transition-all duration-300
        ${
          isSelected
            ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
            : "border-slate-200 hover:border-indigo-200 hover:shadow-md"
        }
        ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isSelected && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
          {!isSelected && !disabled && (
            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
          )}
          {disabled && (
            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/20" />
          )}
          <span
            className={`font-medium ${disabled ? "text-muted-foreground" : ""}`}
          >
            {provider.name}
          </span>
        </div>
        {disabled && (
          <Badge variant="secondary" className="text-xs">
            Coming soon
          </Badge>
        )}
        {provider.enabled && !disabled && (
          <Badge variant="outline" className="text-xs">
            Available
          </Badge>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Runtime status section (read-only)
// ---------------------------------------------------------------------------

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-red-400"}`}
    />
  );
}

function RuntimeStatusSection() {
  const { data: config, isLoading } = useRuntimeConfig();

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-slate-200">
        <CardContent className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading runtime status...
        </CardContent>
      </Card>
    );
  }

  if (!config) return null;

  const items = [
    {
      label: "Hermes Gateway",
      ok: !!config.hermes_api_url,
      detail: config.hermes_api_url ? "Connected" : "Not set",
    },
    {
      label: "Gateway Auth Key",
      ok: config.hermes_api_key_set,
      detail: config.hermes_api_key_set ? "Configured" : "Not set",
    },
    {
      label: "OpenCode Go API Key",
      ok: config.opencode_go_key_set,
      detail: config.opencode_go_key_set ? "Configured" : "Not set",
    },
    {
      label: "OpenRouter API Key",
      ok: config.openrouter_key_set,
      detail: config.openrouter_key_set ? "Configured" : "Not set",
    },
  ];

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-slate-900">Runtime Status</CardTitle>
        <CardDescription>
          Current configuration from environment variables. API key changes require a container restart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
            >
              <StatusDot ok={item.ok} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                <p
                  className={`text-xs ${item.ok ? "text-green-600" : "text-red-500"}`}
                >
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Vision model section
// ---------------------------------------------------------------------------

function VisionModelSection() {
  const { data: config } = useProviderConfig();
  const updateConfig = useUpdateProviderConfig();

  const [visionProvider, setVisionProvider] = useState("");
  const [visionModel, setVisionModel] = useState("");

  useEffect(() => {
    if (config) {
      setVisionProvider(config.vision_provider ?? "");
      setVisionModel(config.vision_model ?? "");
    }
  }, [config]);

  function handleSaveVision() {
    if (!config) return;

    updateConfig.mutate(
      {
        provider: config.provider,
        model: config.model,
        api_key: "",
        vision_provider: visionProvider.trim(),
        vision_model: visionModel.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Vision model configuration saved");
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-slate-900">Vision Model</CardTitle>
        <CardDescription>
          Configure the vision model used for image-based submissions (exam scans, handwritten work).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="vision-provider-input" className="text-sm font-medium">
            Provider
          </label>
          <Input
            id="vision-provider-input"
            value={visionProvider}
            onChange={(e) => setVisionProvider(e.target.value)}
            placeholder="e.g. openrouter"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="vision-model-input" className="text-sm font-medium">
            Model
          </label>
          <Input
            id="vision-model-input"
            value={visionModel}
            onChange={(e) => setVisionModel(e.target.value)}
            placeholder="e.g. google/gemini-2.5-flash-preview-05-20"
          />
        </div>
        <Button
          onClick={handleSaveVision}
          disabled={updateConfig.isPending}
        >
          <Save className="size-4" />
          Save Vision Configuration
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Provider configuration section
// ---------------------------------------------------------------------------

function ProviderSection() {
  const { data: config, isLoading } = useProviderConfig();
  const updateConfig = useUpdateProviderConfig();

  const [selectedProvider, setSelectedProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Sync form state from server data
  useEffect(() => {
    if (config) {
      setSelectedProvider(config.provider || "");
      setModel(config.model || "");
      // Never populate the API key field from the server -- it is masked
      setApiKey("");
    }
  }, [config]);

  const selectedProviderDef = PROVIDERS.find((p) => p.id === selectedProvider);

  const handleSelectProvider = useCallback((id: string) => {
    setSelectedProvider(id);
    // Reset model when switching providers
    setModel("");
    setApiKey("");
  }, []);

  function handleSaveProvider() {
    if (!selectedProvider) {
      toast.error("Please select a provider");
      return;
    }
    if (!model.trim()) {
      toast.error("Please enter a model name");
      return;
    }

    updateConfig.mutate(
      { provider: selectedProvider, model: model.trim(), api_key: apiKey },
      {
        onSuccess: () => {
          toast.success("Provider configuration saved");
          setApiKey(""); // Clear the input after save
          setShowApiKey(false);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading provider configuration...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-slate-900">LLM Provider & Model</CardTitle>
        <CardDescription>
          Select which AI provider and model to use for grading evaluations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isSelected={selectedProvider === provider.id}
                onSelect={handleSelectProvider}
              />
            ))}
          </div>
        </div>

        {/* Model + API key fields -- only visible when a provider is selected */}
        {selectedProvider && selectedProviderDef?.enabled && (
          <>
            <Separator />

            {/* Model */}
            <div className="space-y-2">
              <label htmlFor="model-input" className="text-sm font-medium">
                Model
              </label>
              <Input
                id="model-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  selectedProviderDef.models.length > 0
                    ? `e.g. ${selectedProviderDef.models[0]}`
                    : "Enter model identifier"
                }
              />
              {selectedProviderDef.models.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Suggested:
                  </span>
                  {selectedProviderDef.models.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModel(m)}
                      className={`
                        rounded-md border px-2 py-0.5 text-xs transition-colors
                        ${
                          model === m
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                        }
                      `}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* API key */}
            <div className="space-y-2">
              <label htmlFor="api-key-input" className="text-sm font-medium">
                Hermes Gateway Key
              </label>
              <div className="relative">
                <Input
                  id="api-key-input"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    config?.api_key_set
                      ? `Current key: ${config.api_key_hint}`
                      : "Paste your Hermes gateway auth key"
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {config?.api_key_set && !apiKey && (
                <p className="text-xs text-muted-foreground">
                  A gateway key is saved. Leave blank to keep the current key.
                </p>
              )}
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/50">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                This key authenticates the worker to the Hermes gateway. Upstream
                provider API keys (OpenCode Go, OpenRouter) are configured via
                environment variables and require a container restart to change.
              </p>
            </div>

            {/* Save button */}
            <Button
              onClick={handleSaveProvider}
              disabled={updateConfig.isPending || !model.trim()}
            >
              <Save className="size-4" />
              Save Provider Configuration
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Grading configuration section (existing)
// ---------------------------------------------------------------------------

function GradingSection() {
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
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading grading settings...
        </CardContent>
      </Card>
    );
  }

  return (
    <>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div>
        <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase mb-2 block">
          Configuration
        </span>
        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
      </div>

      {/* Section 0: Runtime Status */}
      <section className="space-y-6">
        <RuntimeStatusSection />
      </section>

      {/* Section 1: LLM Provider & Model */}
      <section className="space-y-6">
        <ProviderSection />
      </section>

      {/* Section 1b: Vision Model */}
      <section className="space-y-6">
        <VisionModelSection />
      </section>

      {/* Section 2: Grading Configuration */}
      <section className="space-y-6">
        <h2 className="text-lg font-bold text-slate-900">
          Grading Configuration
        </h2>
        <GradingSection />
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AiSettings } from "@/lib/ai-settings";

type AiSettingsFormProps = {
  initialSettings: AiSettings;
};

const INTENT_LABELS: Record<string, string> = {
  pricing: "Pricing",
  schedule: "Schedule",
  location: "Location",
  programme: "Programme",
  eligibility: "Eligibility",
  registration: "Registration",
  certificate: "Certificate",
  greeting: "Greeting",
};

export default function AiSettingsForm({
  initialSettings,
}: AiSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState(initialSettings.mode);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(
    initialSettings.auto_reply_enabled
  );
  const [allowedAutoIntents, setAllowedAutoIntents] = useState<string[]>(
    initialSettings.allowed_auto_intents
  );
  const [minConfidence, setMinConfidence] = useState(
    initialSettings.min_confidence
  );
  const [feedback, setFeedback] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({
    type: "idle",
    message: "",
  });

  const allIntents = Object.keys(INTENT_LABELS);

  useEffect(() => {
    setMode(initialSettings.mode);
    setAutoReplyEnabled(initialSettings.auto_reply_enabled);
    setAllowedAutoIntents(initialSettings.allowed_auto_intents);
    setMinConfidence(initialSettings.min_confidence);
  }, [initialSettings]);

  function toggleIntent(intent: string) {
    setAllowedAutoIntents((current) =>
      current.includes(intent)
        ? current.filter((item) => item !== intent)
        : [...current, intent]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback({ type: "idle", message: "" });

    const response = await fetch("/api/settings/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        auto_reply_enabled: mode === "suggestion_only" ? false : autoReplyEnabled,
        allowed_auto_intents: allowedAutoIntents,
        min_confidence: minConfidence,
      }),
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      setFeedback({
        type: "error",
        message: payload.error ?? "Impossible de sauvegarder les réglages IA.",
      });
      return;
    }

    setFeedback({
      type: "success",
      message: "Réglages IA sauvegardés.",
    });

    startTransition(() => {
      router.refresh();
    });
  }

  const effectiveAutoReplyEnabled =
    mode === "suggestion_only" ? false : autoReplyEnabled;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20"
    >
      <div className="grid gap-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Mode IA
          </label>
          <select
            value={mode}
            onChange={(event) => {
              const nextMode = event.target.value as AiSettings["mode"];
              setMode(nextMode);
              if (nextMode === "suggestion_only") {
                setAutoReplyEnabled(false);
              }
            }}
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
          >
            <option value="suggestion_only">Suggestion uniquement</option>
            <option value="limited_auto_reply">Auto-réponse limitée</option>
            <option value="autopilot" disabled>
              Autopilote, désactivé pour MVP
            </option>
          </select>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
          <input
            type="checkbox"
            checked={effectiveAutoReplyEnabled}
            disabled={mode === "suggestion_only"}
            onChange={(event) => setAutoReplyEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
          />
          <span className="text-sm text-slate-200">Auto-réponse activée</span>
        </label>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-200">
            Intentions autorisées
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {allIntents.map((intent) => {
              const checked = allowedAutoIntents.includes(intent);

              return (
                <label
                  key={intent}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleIntent(intent)}
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
                  />
                  <span>{INTENT_LABELS[intent] ?? intent}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Confidence minimale
          </label>
          <select
            value={minConfidence}
            onChange={(event) =>
              setMinConfidence(event.target.value as AiSettings["min_confidence"])
            }
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-50">
          Pour le test MVP, il est recommandé de rester en Suggestion uniquement.
          L'auto-réponse limitée doit être activée seulement après validation
          humaine des réponses IA.
        </div>

        {feedback.message ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-50"
                : "border border-rose-400/20 bg-rose-400/10 text-rose-50"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-slate-400">
            Mode actuel: <span className="text-slate-200">{mode}</span>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>
    </form>
  );
}

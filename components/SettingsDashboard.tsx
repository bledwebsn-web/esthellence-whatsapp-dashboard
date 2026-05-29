"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import ThemeToggle from "@/components/ThemeToggle";

type SettingsDraft = {
  ai_mode: "suggestion_only" | "limited_auto_reply" | "autopilot";
  auto_reply_enabled: boolean;
  allowed_auto_reply_intents: string[];
  minimum_confidence: "high" | "medium" | "low";
  human_handoff_message: string;
  fallback_message: string;
  out_of_scope_message: string;
  media_received_message: string;
  after_hours_message: string;
};

type SettingsDashboardProps = {
  initialSettings: SettingsDraft;
};

type ModeOption = {
  value: SettingsDraft["ai_mode"];
  title: string;
  description: string;
  recommended: boolean;
  disabled?: boolean;
};

const INTENT_OPTIONS = [
  { value: "pricing", label: "Prix / tarifs", description: "Questions sur le prix, le coût ou les tarifs." },
  { value: "schedule", label: "Dates / horaires / lieu", description: "Planning, dates, lieu ou disponibilité." },
  { value: "registration", label: "Inscription", description: "S’inscrire, réserver ou valider une place." },
  { value: "eligibility", label: "Éligibilité", description: "Qui peut participer, prérequis, profil." },
  { value: "general_info", label: "Informations générales", description: "Infos pratiques validées par la base." },
  { value: "fallback", label: "Fallback / transfert humain", description: "Bascule vers un conseiller si besoin." },
] as const;

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "suggestion_only" as const,
    title: "Suggestion uniquement",
    description: "L’IA prépare une réponse, mais un humain clique sur Envoyer.",
    recommended: true,
  },
  {
    value: "limited_auto_reply" as const,
    title: "Auto-réponse limitée",
    description: "L’IA répond seule sur les questions simples et validées.",
    recommended: true,
  },
  {
    value: "autopilot" as const,
    title: "Auto-pilote",
    description: "Mode avancé, à activer plus tard.",
    recommended: false,
    disabled: true,
  },
] as const;

const DEFAULT_SETTINGS: SettingsDraft = {
  ai_mode: "suggestion_only",
  auto_reply_enabled: false,
  allowed_auto_reply_intents: [
    "pricing",
    "schedule",
    "registration",
    "eligibility",
    "general_info",
    "fallback",
  ],
  minimum_confidence: "high",
  human_handoff_message:
    "Je préfère transmettre votre demande à un conseiller afin de vous donner une réponse exacte. Pouvez-vous préciser votre besoin ?",
  fallback_message:
    "Je n’ai pas assez d’informations validées pour répondre avec certitude. Je transmets votre demande à un conseiller.",
  out_of_scope_message:
    "Cette demande nécessite une vérification par un conseiller. L’équipe va vous orienter.",
  media_received_message:
    "Nous avons bien reçu votre fichier. Un conseiller va le consulter et vous répondre.",
  after_hours_message: "Merci pour votre message. L’équipe vous répondra dès que possible.",
};

function readJsonResponse<T>(response: Response) {
  return response.text().then((raw) => {
    try {
      return (raw ? JSON.parse(raw) : {}) as T;
    } catch {
      throw new Error("Réponse serveur invalide. Rechargez la page ou vérifiez la route API.");
    }
  });
}

function fieldClassName() {
  return "w-full rounded-2xl border border-[color:var(--app-input-border)] bg-[color:var(--app-input)] px-4 py-3 text-sm text-[color:var(--app-fg)] outline-none transition placeholder:text-[color:var(--app-muted)] focus:border-cyan-400/50";
}

function surfaceClassName() {
  return "rounded-3xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] shadow-sm backdrop-blur";
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${surfaceClassName()} p-4 sm:p-5`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[color:var(--app-fg)] sm:text-lg">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-[color:var(--app-muted)]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ModeCard({
  option,
  active,
  onClick,
}: {
  option: ModeOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={option.disabled}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? "border-[color:var(--app-fg)] bg-[color:var(--app-panel-strong)]"
          : "border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] hover:bg-[color:var(--app-panel-strong)]"
      } ${option.disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--app-fg)]">{option.title}</div>
          <p className="mt-1 text-sm leading-6 text-[color:var(--app-muted)]">{option.description}</p>
        </div>
        {option.recommended ? (
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-200">
            Recommandé
          </span>
        ) : null}
      </div>
      {option.disabled ? (
        <div className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--app-muted)]">
          Bientôt
        </div>
      ) : null}
    </button>
  );
}

function IntentChip({
  intent,
  checked,
  onToggle,
}: {
  intent: (typeof INTENT_OPTIONS)[number];
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-2xl border px-4 py-3 text-left transition ${
        checked
          ? "border-[color:var(--app-fg)] bg-[color:var(--app-fg)] text-[color:var(--app-bg)]"
          : "border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] text-[color:var(--app-fg)] hover:bg-[color:var(--app-panel-strong)]"
      }`}
    >
      <div className="text-sm font-semibold">{intent.label}</div>
      <p className={`mt-1 text-xs leading-5 ${checked ? "text-[color:var(--app-bg)]/80" : "text-[color:var(--app-muted)]"}`}>
        {intent.description}
      </p>
    </button>
  );
}

function fieldLabelClass() {
  return "text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]";
}

export default function SettingsDashboard({ initialSettings }: SettingsDashboardProps) {
  const [draft, setDraft] = useState<SettingsDraft>(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [saveFeedback, setSaveFeedback] = useState<{ type: "idle" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });

  useEffect(() => {
    setDraft(initialSettings);
  }, [initialSettings]);

  const activeIntents = useMemo(() => new Set(draft.allowed_auto_reply_intents), [draft.allowed_auto_reply_intents]);
  const autoReplyEffective = draft.ai_mode === "suggestion_only" ? false : draft.auto_reply_enabled;

  function updateDraft<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleIntent(value: string) {
    setDraft((current) => {
      const exists = current.allowed_auto_reply_intents.includes(value);
      return {
        ...current,
        allowed_auto_reply_intents: exists
          ? current.allowed_auto_reply_intents.filter((item) => item !== value)
          : [...current.allowed_auto_reply_intents, value],
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    setSaveFeedback({ type: "idle", message: "" });

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(draft),
        });

        const payload = await readJsonResponse<{ success?: boolean; settings?: SettingsDraft; error?: string }>(response);

        if (!response.ok || !payload.success || !payload.settings) {
          throw new Error(payload.error || "Impossible d’enregistrer les réglages.");
        }

        setDraft(payload.settings);
        setSaveFeedback({
          type: "success",
          message: "Réglages enregistrés.",
        });
      } catch (error) {
        setSaveFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "Impossible d’enregistrer les réglages. Réessayez.",
        });
      }
    });
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <header className="sticky top-0 z-30 border-b border-[color:var(--app-border)] bg-[var(--app-header)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
                  Réglages WABAssist
                </p>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium ${
                    autoReplyEffective
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                      : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
                  }`}
                >
                  {autoReplyEffective ? "Auto-réponse active" : "Auto-réponse désactivée"}
                </span>
              </div>
              <div className="mt-1">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  Configurez l’IA et l’auto-réponse WhatsApp
                </h1>
                <p className="mt-1 text-sm text-[color:var(--app-muted)]">
                  Réglages métier globaux pour WABAssist.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              <button
                type="submit"
                form="settings-form"
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-[color:var(--app-fg)] px-3 py-2 text-xs font-semibold text-[color:var(--app-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
              >
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>

          {saveFeedback.message ? (
            <div
              className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                saveFeedback.type === "success"
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-50"
                  : "border-rose-400/20 bg-rose-400/10 text-rose-50"
              }`}
            >
              {saveFeedback.message}
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <form id="settings-form" onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-6">
            <SectionCard
              title="Mode IA"
              description="Choisissez le niveau d’autonomie. Pour le MVP, privilégiez la suggestion ou l’auto-réponse limitée."
            >
              <div className="grid gap-3">
                {MODE_OPTIONS.map((option) => (
                  <ModeCard
                    key={option.value}
                    option={option}
                    active={draft.ai_mode === option.value}
                    onClick={() => {
                      if (option.disabled) {
                        return;
                      }
                      updateDraft("ai_mode", option.value);
                      if (option.value === "suggestion_only") {
                        updateDraft("auto_reply_enabled", false);
                      }
                    }}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Auto-réponse"
              description="Quand elle est activée, WABAssist peut répondre automatiquement selon les règles de sécurité."
            >
              <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[color:var(--app-fg)]">Auto-réponse WABAssist</div>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--app-muted)]">
                    {draft.ai_mode === "suggestion_only"
                      ? "La suggestion uniquement désactive l’auto-réponse."
                      : "Utilisée uniquement lorsque la confiance et les intentions sont autorisées."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateDraft("auto_reply_enabled", !draft.auto_reply_enabled)}
                  disabled={draft.ai_mode === "suggestion_only"}
                  className={`inline-flex min-w-[120px] items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                    autoReplyEffective
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                      : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
                  } ${draft.ai_mode === "suggestion_only" ? "cursor-not-allowed opacity-60" : "hover:bg-[color:var(--app-panel-strong)]"}`}
                >
                  {autoReplyEffective ? "Activée" : "Désactivée"}
                </button>
              </div>
            </SectionCard>

            <SectionCard
              title="Intentions autorisées"
              description="Si l’intention n’est pas autorisée ou si la confiance est faible, la conversation est transférée à un humain."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {INTENT_OPTIONS.map((intent) => (
                  <IntentChip
                    key={intent.value}
                    intent={intent}
                    checked={activeIntents.has(intent.value)}
                    onToggle={() => toggleIntent(intent.value)}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Seuil de confiance"
              description="Plus le seuil est strict, moins l’IA répond seule."
            >
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { value: "high", label: "Élevée seulement" },
                  { value: "medium", label: "Moyenne et élevée" },
                  { value: "low", label: "Toutes les réponses" },
                ].map((option) => {
                  const active = draft.minimum_confidence === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateDraft("minimum_confidence", option.value as SettingsDraft["minimum_confidence"])}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-[color:var(--app-fg)] bg-[color:var(--app-panel-strong)]"
                          : "border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] hover:bg-[color:var(--app-panel-strong)]"
                      }`}
                    >
                      <div className="text-sm font-semibold text-[color:var(--app-fg)]">{option.label}</div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard
              title="Sécurité et transfert humain"
              description="Ces règles protègent la qualité commerciale et évitent les réponses hasardeuses."
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] p-4">
                  <div className={fieldLabelClass()}>Conditions de transfert</div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--app-fg)]">
                    <li>• Information absente de la base de connaissances</li>
                    <li>• Confiance faible</li>
                    <li>• Intention inconnue</li>
                    <li>• Demande sensible</li>
                    <li>• Réclamation ou demande hors périmètre</li>
                    <li>• Média reçu non analysé</li>
                    <li>• Le lead demande un conseiller</li>
                  </ul>
                </div>

                <div className="grid gap-3">
                  <label className="grid gap-2">
                    <span className={fieldLabelClass()}>Message de transfert humain</span>
                    <textarea
                      value={draft.human_handoff_message}
                      onChange={(event) => updateDraft("human_handoff_message", event.target.value)}
                      rows={5}
                      className={fieldClassName()}
                    />
                  </label>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard
              title="Messages par défaut"
              description="Courts, clairs et adaptés à WhatsApp."
            >
              <div className="grid gap-4">
                {[
                  {
                    key: "fallback_message" as const,
                    label: "Fallback",
                    placeholder:
                      "Je n’ai pas assez d’informations validées pour répondre avec certitude. Je transmets votre demande à un conseiller.",
                  },
                  {
                    key: "out_of_scope_message" as const,
                    label: "Hors périmètre",
                    placeholder:
                      "Cette demande nécessite une vérification par un conseiller. L’équipe va vous orienter.",
                  },
                  {
                    key: "media_received_message" as const,
                    label: "Média reçu",
                    placeholder:
                      "Nous avons bien reçu votre fichier. Un conseiller va le consulter et vous répondre.",
                  },
                  {
                    key: "after_hours_message" as const,
                    label: "Après les heures",
                    placeholder: "Merci pour votre message. L’équipe vous répondra dès que possible.",
                  },
                ].map((entry) => (
                  <label key={entry.key} className="grid gap-2">
                    <span className={fieldLabelClass()}>{entry.label}</span>
                    <textarea
                      value={draft[entry.key]}
                      onChange={(event) => updateDraft(entry.key, event.target.value)}
                      rows={4}
                      className={fieldClassName()}
                      placeholder={entry.placeholder}
                    />
                  </label>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Règles de sécurité WABAssist"
              description="Ces règles s’appliquent à toutes les réponses automatiques."
            >
              <ul className="space-y-2 text-sm leading-6 text-[color:var(--app-fg)]">
                <li>• Répond uniquement avec la base de connaissances validée</li>
                <li>• Ne promet jamais de résultat</li>
                <li>• N’invente jamais de prix, disponibilité ou offre</li>
                <li>• Transfère à un humain si l’information manque</li>
                <li>• Ne demande pas de données sensibles inutiles</li>
              </ul>
              <p className="mt-4 text-sm leading-6 text-[color:var(--app-muted)]">
                Les réglages IA, l’auto-réponse globale, les intentions autorisées et le seuil de confiance pilotent
                déjà WABAssist. Les messages par défaut sont stockés ici pour les prochains contrôles de fallback.
              </p>
            </SectionCard>
          </div>
        </form>
      </main>
    </div>
  );
}

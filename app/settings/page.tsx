import DashboardQuickLink from "@/components/DashboardQuickLink";
import SettingsDashboard from "@/components/SettingsDashboard";
import { getAiSettings } from "@/lib/ai-settings";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type StoredSettingsRow = {
  value: unknown;
};

type SettingsPageProps = {
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

const SETTINGS_KEY = "wabassist_settings";

const DEFAULT_SETTINGS: SettingsPageProps = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeUiIntents(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SETTINGS.allowed_auto_reply_intents];
  }

  const allowed = new Set([
    "pricing",
    "schedule",
    "registration",
    "eligibility",
    "general_info",
    "fallback",
  ]);

  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => allowed.has(item));

  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [...DEFAULT_SETTINGS.allowed_auto_reply_intents];
}

function mapRuntimeIntentsToUiIntents(values: unknown) {
  if (!Array.isArray(values)) {
    return [...DEFAULT_SETTINGS.allowed_auto_reply_intents];
  }

  const runtime = new Set(
    values.filter((item): item is string => typeof item === "string").map((item) => item.trim())
  );

  const mapped: string[] = [];
  if (runtime.has("pricing")) mapped.push("pricing");
  if (runtime.has("schedule")) mapped.push("schedule");
  if (runtime.has("registration")) mapped.push("registration");
  if (runtime.has("eligibility")) mapped.push("eligibility");
  if (
    runtime.has("location") ||
    runtime.has("programme") ||
    runtime.has("certificate") ||
    runtime.has("greeting")
  ) {
    mapped.push("general_info");
  }
  mapped.push("fallback");

  return Array.from(new Set(mapped));
}

async function loadExtendedSettings(): Promise<SettingsPageProps> {
  const core = await getAiSettings();

  const storedResult = await db.query<StoredSettingsRow>(
    `
    select value
    from app_settings
    where key = $1
    limit 1
    `,
    [SETTINGS_KEY]
  );

  const storedValue = storedResult.rows[0]?.value;
  const extras = isRecord(storedValue) ? storedValue : {};

  return {
    ai_mode:
      core.mode === "suggestion_only" || core.mode === "limited_auto_reply"
        ? core.mode
        : DEFAULT_SETTINGS.ai_mode,
    auto_reply_enabled: core.mode === "suggestion_only" ? false : core.auto_reply_enabled,
    allowed_auto_reply_intents: normalizeUiIntents(
      extras.allowed_auto_reply_intents ?? mapRuntimeIntentsToUiIntents(core.allowed_auto_intents)
    ),
    minimum_confidence:
      core.min_confidence === "high" ||
      core.min_confidence === "medium" ||
      core.min_confidence === "low"
        ? core.min_confidence
        : DEFAULT_SETTINGS.minimum_confidence,
    human_handoff_message: normalizeString(
      extras.human_handoff_message,
      DEFAULT_SETTINGS.human_handoff_message
    ),
    fallback_message: normalizeString(extras.fallback_message, DEFAULT_SETTINGS.fallback_message),
    out_of_scope_message: normalizeString(
      extras.out_of_scope_message,
      DEFAULT_SETTINGS.out_of_scope_message
    ),
    media_received_message: normalizeString(
      extras.media_received_message,
      DEFAULT_SETTINGS.media_received_message
    ),
    after_hours_message: normalizeString(
      extras.after_hours_message,
      DEFAULT_SETTINGS.after_hours_message
    ),
  };
}

export default async function SettingsPage() {
  const initialSettings = await loadExtendedSettings();

  return (
    <div className="bg-[var(--app-bg)] text-[color:var(--app-fg)]">
      <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
        <div className="flex justify-end">
          <DashboardQuickLink compact className="text-xs sm:text-sm" />
        </div>
      </div>
      <SettingsDashboard initialSettings={initialSettings} />
    </div>
  );
}

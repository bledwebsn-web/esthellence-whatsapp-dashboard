import SettingsDashboard from "@/components/SettingsDashboard";
import { getAiSettings } from "@/lib/ai-settings";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type StoredSettingsRow = {
  value: unknown;
};

type KnowledgeBaseStatsRow = {
  total_count: number | null;
  active_count: number | null;
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

type KnowledgeBaseStats = {
  total: number;
  active: number;
};

type TechnicalConfig = {
  whatsappConfigured: boolean;
  webhookConfigured: boolean;
  groqConfigured: boolean;
  groqTextModel: string;
  mode: "development" | "production";
  whatsappPhoneConfigured: boolean;
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
  after_hours_message:
    "Merci pour votre message. L’équipe vous répondra dès que possible.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function normalizeString(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
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

async function loadKnowledgeBaseStats(): Promise<KnowledgeBaseStats> {
  const clientResult = await db.query(
    `
    select id
    from clients
    where name = $1
    limit 1
    `,
    ["Esthellence"]
  );

  const clientId = clientResult.rows[0]?.id as string | undefined;

  if (!clientId) {
    return { total: 0, active: 0 };
  }

  const statsResult = await db.query<KnowledgeBaseStatsRow>(
    `
    select
      count(*)::int as total_count,
      count(*) filter (where coalesce(is_active, true))::int as active_count
    from knowledge_base
    where client_id = $1
    `,
    [clientId]
  );

  return {
    total: statsResult.rows[0]?.total_count ?? 0,
    active: statsResult.rows[0]?.active_count ?? 0,
  };
}

function getTechnicalConfig(): TechnicalConfig {
  return {
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    ),
    webhookConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    groqTextModel: process.env.GROQ_TEXT_MODEL ?? "llama-3.3-70b-versatile",
    mode: process.env.NODE_ENV === "production" ? "production" : "development",
    whatsappPhoneConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
  };
}

export default async function SettingsPage() {
  const [initialSettings, knowledgeBaseStats] = await Promise.all([
    loadExtendedSettings(),
    loadKnowledgeBaseStats(),
  ]);

  const technicalConfig = getTechnicalConfig();

  return (
    <SettingsDashboard
      initialSettings={initialSettings}
      knowledgeBaseStats={knowledgeBaseStats}
      technicalConfig={technicalConfig}
    />
  );
}

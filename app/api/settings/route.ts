import { db } from "@/lib/db";
import {
  getAiSettings,
  saveAiSettings,
  type AiMode,
  type AiMinConfidence,
} from "@/lib/ai-settings";

type WabassistSettings = {
  ai_mode: AiMode;
  auto_reply_enabled: boolean;
  allowed_auto_reply_intents: string[];
  minimum_confidence: AiMinConfidence;
  human_handoff_message: string;
  fallback_message: string;
  out_of_scope_message: string;
  media_received_message: string;
  after_hours_message: string;
};

const SETTINGS_KEY = "wabassist_settings";
const UI_INTENT_VALUES = [
  "pricing",
  "schedule",
  "registration",
  "eligibility",
  "general_info",
  "fallback",
] as const;

const DEFAULT_SETTINGS: WabassistSettings = {
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

const RUNTIME_INTENT_MAP: Record<string, string[]> = {
  pricing: ["pricing"],
  schedule: ["schedule"],
  registration: ["registration"],
  eligibility: ["eligibility"],
  general_info: ["location", "programme", "certificate", "greeting"],
  fallback: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMode(value: unknown): AiMode {
  return value === "limited_auto_reply" || value === "suggestion_only"
    ? value
    : DEFAULT_SETTINGS.ai_mode;
}

function normalizeConfidence(value: unknown): AiMinConfidence {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : DEFAULT_SETTINGS.minimum_confidence;
}

function normalizeText(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeUiIntents(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SETTINGS.allowed_auto_reply_intents];
  }

  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => UI_INTENT_VALUES.includes(item as (typeof UI_INTENT_VALUES)[number]));

  return cleaned.length > 0
    ? Array.from(new Set(cleaned))
    : [...DEFAULT_SETTINGS.allowed_auto_reply_intents];
}

function mapUiIntentsToRuntimeIntents(values: string[]) {
  const runtime = new Set<string>();

  for (const value of values) {
    for (const item of RUNTIME_INTENT_MAP[value] ?? []) {
      runtime.add(item);
    }
  }

  return Array.from(runtime);
}

function mapRuntimeIntentsToUiIntents(values: unknown) {
  if (!Array.isArray(values)) {
    return [...DEFAULT_SETTINGS.allowed_auto_reply_intents];
  }

  const normalized = new Set(
    values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
  );

  const result: string[] = [];

  if (normalized.has("pricing")) result.push("pricing");
  if (normalized.has("schedule")) result.push("schedule");
  if (normalized.has("registration")) result.push("registration");
  if (normalized.has("eligibility")) result.push("eligibility");

  if (
    normalized.has("location") ||
    normalized.has("programme") ||
    normalized.has("certificate") ||
    normalized.has("greeting")
  ) {
    result.push("general_info");
  }

  if (result.length === 0) {
    result.push(...DEFAULT_SETTINGS.allowed_auto_reply_intents);
  }

  if (normalized.has("fallback")) {
    result.push("fallback");
  }

  return Array.from(new Set(result));
}

async function ensureAppSettingsTable() {
  await db.query(`
    create table if not exists app_settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamp with time zone default now()
    )
  `);
}

async function readStoredSettings(): Promise<Partial<WabassistSettings>> {
  await ensureAppSettingsTable();

  const result = await db.query(
    `
    select value
    from app_settings
    where key = $1
    limit 1
    `,
    [SETTINGS_KEY]
  );

  const rawValue = result.rows[0]?.value;

  if (!isRecord(rawValue)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ai_mode: normalizeMode(rawValue.ai_mode),
    auto_reply_enabled:
      typeof rawValue.auto_reply_enabled === "boolean"
        ? rawValue.auto_reply_enabled
        : DEFAULT_SETTINGS.auto_reply_enabled,
    allowed_auto_reply_intents: normalizeUiIntents(rawValue.allowed_auto_reply_intents),
    minimum_confidence: normalizeConfidence(rawValue.minimum_confidence),
    human_handoff_message: normalizeText(
      rawValue.human_handoff_message,
      DEFAULT_SETTINGS.human_handoff_message
    ),
    fallback_message: normalizeText(rawValue.fallback_message, DEFAULT_SETTINGS.fallback_message),
    out_of_scope_message: normalizeText(
      rawValue.out_of_scope_message,
      DEFAULT_SETTINGS.out_of_scope_message
    ),
    media_received_message: normalizeText(
      rawValue.media_received_message,
      DEFAULT_SETTINGS.media_received_message
    ),
    after_hours_message: normalizeText(
      rawValue.after_hours_message,
      DEFAULT_SETTINGS.after_hours_message
    ),
  };
}

function sanitizePayload(body: unknown): WabassistSettings {
  if (!isRecord(body)) {
    throw new Error("Invalid payload");
  }

  const ai_mode = normalizeMode(body.ai_mode ?? body.mode);
  if (ai_mode === "autopilot") {
    throw new Error("Autopilot is disabled for MVP");
  }

  const allowed_auto_reply_intents = normalizeUiIntents(
    body.allowed_auto_reply_intents ?? body.allowed_auto_intents
  );

  return {
    ai_mode,
    auto_reply_enabled:
      ai_mode === "suggestion_only"
        ? false
        : typeof body.auto_reply_enabled === "boolean"
          ? body.auto_reply_enabled
          : DEFAULT_SETTINGS.auto_reply_enabled,
    allowed_auto_reply_intents,
    minimum_confidence: normalizeConfidence(body.minimum_confidence ?? body.min_confidence),
    human_handoff_message: normalizeText(
      body.human_handoff_message,
      DEFAULT_SETTINGS.human_handoff_message
    ),
    fallback_message: normalizeText(body.fallback_message, DEFAULT_SETTINGS.fallback_message),
    out_of_scope_message: normalizeText(
      body.out_of_scope_message,
      DEFAULT_SETTINGS.out_of_scope_message
    ),
    media_received_message: normalizeText(
      body.media_received_message,
      DEFAULT_SETTINGS.media_received_message
    ),
    after_hours_message: normalizeText(
      body.after_hours_message,
      DEFAULT_SETTINGS.after_hours_message
    ),
  };
}

async function saveExtendedSettings(settings: WabassistSettings) {
  await ensureAppSettingsTable();

  await db.query(
    `
    insert into app_settings (key, value, updated_at)
    values ($1, $2::jsonb, now())
    on conflict (key)
    do update set value = excluded.value,
                  updated_at = now()
    `,
    [SETTINGS_KEY, JSON.stringify(settings)]
  );
}

async function getResponsePayload(): Promise<WabassistSettings> {
  const coreSettings = await getAiSettings();
  const storedSettings = await readStoredSettings();

  return {
    ai_mode:
      storedSettings.ai_mode ?? (coreSettings.mode === "autopilot" ? DEFAULT_SETTINGS.ai_mode : coreSettings.mode),
    auto_reply_enabled:
      storedSettings.ai_mode === "suggestion_only"
        ? false
        : typeof storedSettings.auto_reply_enabled === "boolean"
          ? storedSettings.auto_reply_enabled
          : coreSettings.auto_reply_enabled,
    allowed_auto_reply_intents:
      storedSettings.allowed_auto_reply_intents ??
      mapRuntimeIntentsToUiIntents(coreSettings.allowed_auto_intents),
    minimum_confidence: storedSettings.minimum_confidence ?? coreSettings.min_confidence,
    human_handoff_message:
      storedSettings.human_handoff_message ?? DEFAULT_SETTINGS.human_handoff_message,
    fallback_message: storedSettings.fallback_message ?? DEFAULT_SETTINGS.fallback_message,
    out_of_scope_message:
      storedSettings.out_of_scope_message ?? DEFAULT_SETTINGS.out_of_scope_message,
    media_received_message:
      storedSettings.media_received_message ?? DEFAULT_SETTINGS.media_received_message,
    after_hours_message:
      storedSettings.after_hours_message ?? DEFAULT_SETTINGS.after_hours_message,
  };
}

export async function GET() {
  try {
    const settings = await getResponsePayload();

    return Response.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Failed to load settings:", error);
    return Response.json(
      {
        success: false,
        error: "Impossible de charger les réglages.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const payload = sanitizePayload(body);
    const runtimeAllowedIntents = mapUiIntentsToRuntimeIntents(payload.allowed_auto_reply_intents);

    await saveAiSettings({
      mode: payload.ai_mode,
      auto_reply_enabled: payload.ai_mode === "suggestion_only" ? false : payload.auto_reply_enabled,
      allowed_auto_intents: runtimeAllowedIntents,
      min_confidence: payload.minimum_confidence,
    });

    await saveExtendedSettings(payload);

    const settings = await getResponsePayload();

    return Response.json({
      success: true,
      settings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossible de sauvegarder les réglages.";

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
}

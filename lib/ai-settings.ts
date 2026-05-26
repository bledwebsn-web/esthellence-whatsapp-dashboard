export const AI_MODES = [
  "suggestion_only",
  "limited_auto_reply",
  "autopilot",
] as const;

export const AI_MIN_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export const DEFAULT_ALLOWED_AUTO_INTENTS = [
  "pricing",
  "schedule",
  "location",
  "programme",
  "eligibility",
  "registration",
  "certificate",
  "greeting",
] as const;

export type AiMode = (typeof AI_MODES)[number];
export type AiMinConfidence = (typeof AI_MIN_CONFIDENCE_LEVELS)[number];

export type AiSettings = {
  mode: AiMode;
  auto_reply_enabled: boolean;
  allowed_auto_intents: string[];
  min_confidence: AiMinConfidence;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  mode: "suggestion_only",
  auto_reply_enabled: false,
  allowed_auto_intents: [...DEFAULT_ALLOWED_AUTO_INTENTS],
  min_confidence: "high",
};

const ALLOWED_INTENT_SET = new Set<string>(DEFAULT_ALLOWED_AUTO_INTENTS);

function getDefaultSettings(): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    allowed_auto_intents: [...DEFAULT_AI_SETTINGS.allowed_auto_intents],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMode(value: unknown): AiMode {
  return AI_MODES.includes(value as AiMode)
    ? (value as AiMode)
    : DEFAULT_AI_SETTINGS.mode;
}

function normalizeMinConfidence(value: unknown): AiMinConfidence {
  return AI_MIN_CONFIDENCE_LEVELS.includes(value as AiMinConfidence)
    ? (value as AiMinConfidence)
    : DEFAULT_AI_SETTINGS.min_confidence;
}

function normalizeAllowedAutoIntents(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_AI_SETTINGS.allowed_auto_intents];
  }

  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && ALLOWED_INTENT_SET.has(item));

  return cleaned.length > 0
    ? Array.from(new Set(cleaned))
    : [...DEFAULT_AI_SETTINGS.allowed_auto_intents];
}

export function normalizeAiSettings(raw: unknown): AiSettings {
  if (!isRecord(raw)) {
    return getDefaultSettings();
  }

  const mode = normalizeMode(raw.mode);
  const min_confidence = normalizeMinConfidence(raw.min_confidence);
  const allowed_auto_intents = normalizeAllowedAutoIntents(
    raw.allowed_auto_intents
  );

  let auto_reply_enabled =
    typeof raw.auto_reply_enabled === "boolean"
      ? raw.auto_reply_enabled
      : DEFAULT_AI_SETTINGS.auto_reply_enabled;

  if (mode === "suggestion_only") {
    auto_reply_enabled = false;
  }

  return {
    mode,
    auto_reply_enabled,
    allowed_auto_intents,
    min_confidence,
  };
}

async function getDb() {
  const { db } = await import("@/lib/db");
  return db;
}

async function ensureAppSettingsTable() {
  const db = await getDb();

  await db.query(`
    create table if not exists app_settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamp with time zone default now()
    )
  `);
}

export async function getAiSettings() {
  await ensureAppSettingsTable();
  const db = await getDb();

  const result = await db.query(
    `select value from app_settings where key = $1 limit 1`,
    ["ai_settings"]
  );

  if (!result.rows[0]?.value) {
    return getDefaultSettings();
  }

  return normalizeAiSettings(result.rows[0].value);
}

export function validateAiSettingsPayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid payload");
  }

  const mode = normalizeMode(body.mode);

  if (body.mode === "autopilot") {
    throw new Error("Autopilot is disabled for MVP");
  }

  return {
    mode,
    auto_reply_enabled:
      mode === "suggestion_only"
        ? false
        : typeof body.auto_reply_enabled === "boolean"
          ? body.auto_reply_enabled
          : false,
    allowed_auto_intents: normalizeAllowedAutoIntents(body.allowed_auto_intents),
    min_confidence: normalizeMinConfidence(body.min_confidence),
  } satisfies AiSettings;
}

export async function saveAiSettings(settings: AiSettings) {
  await ensureAppSettingsTable();
  const db = await getDb();

  await db.query(
    `
    insert into app_settings (key, value, updated_at)
    values ($1, $2::jsonb, now())
    on conflict (key)
    do update set value = excluded.value,
                  updated_at = now()
    `,
    ["ai_settings", JSON.stringify(settings)]
  );

  return settings;
}

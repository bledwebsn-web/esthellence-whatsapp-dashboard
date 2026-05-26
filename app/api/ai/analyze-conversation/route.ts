import { generateGroqChatCompletion } from "@/lib/groq";

type AnalyzeConversationBody = {
  conversation_id?: string;
};

type AnalysisResult = {
  summary: string;
  detected_intent:
    | "pricing"
    | "registration"
    | "schedule"
    | "location"
    | "programme"
    | "trainer"
    | "eligibility"
    | "callback_request"
    | "objection"
    | "not_interested"
    | "spam"
    | "unknown";
  urgency_level: "low" | "normal" | "high";
  detected_language: "fr" | "ar" | "darija_ar" | "en" | "unknown";
  ai_suggested_status:
    | "nouveau"
    | "en_cours"
    | "qualifié"
    | "rdv"
    | "à_rappeler"
    | "perdu"
    | "spam";
  reason: string;
};

const ANALYSIS_FALLBACK: AnalysisResult = {
  summary: "Analyse indisponible. Relecture humaine recommandée.",
  detected_intent: "unknown",
  urgency_level: "normal",
  detected_language: "unknown",
  ai_suggested_status: "en_cours",
  reason: "Analyse IA non exploitable",
};

const ANALYSIS_INTENTS: AnalysisResult["detected_intent"][] = [
  "pricing",
  "registration",
  "schedule",
  "location",
  "programme",
  "trainer",
  "eligibility",
  "callback_request",
  "objection",
  "not_interested",
  "spam",
  "unknown",
];

const ANALYSIS_STATUSES: AnalysisResult["ai_suggested_status"][] = [
  "nouveau",
  "en_cours",
  "qualifié",
  "rdv",
  "à_rappeler",
  "perdu",
  "spam",
];

const ANALYSIS_LANGUAGES: AnalysisResult["detected_language"][] = [
  "fr",
  "ar",
  "darija_ar",
  "en",
  "unknown",
];

const ANALYSIS_URGENCY: AnalysisResult["urgency_level"][] = [
  "low",
  "normal",
  "high",
];

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getRecordValue(candidate: Record<string, unknown>, keys: string[]) {
  const normalizedCandidate = new Map<string, unknown>();

  for (const [key, value] of Object.entries(candidate)) {
    normalizedCandidate.set(normalizeKey(key), value);
  }

  for (const key of keys) {
    const value = normalizedCandidate.get(normalizeKey(key));
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
) {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return fallback;
  }

  const direct = allowed.find((item) => item === normalized);
  return direct ?? fallback;
}

function clampToFiveLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
}

function normalizeAnalysis(raw: unknown): AnalysisResult {
  if (typeof raw === "string") {
    const trimmed = raw.trim();

    try {
      const parsed = JSON.parse(trimmed);
      return normalizeAnalysis(parsed);
    } catch {
      if (trimmed && trimmed !== "[object Object]") {
        return {
          ...ANALYSIS_FALLBACK,
          summary: clampToFiveLines(trimmed),
        };
      }

      return ANALYSIS_FALLBACK;
    }
  }

  if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;

    const summary = asTrimmedString(
      getRecordValue(candidate, ["summary", "resume", "résumé"])
    );

    const detected_intent = toAllowedValue(
      getRecordValue(candidate, [
        "detected_intent",
        "detected intent",
        "intention_detectee",
        "intention détectée",
      ]),
      ANALYSIS_INTENTS,
      ANALYSIS_FALLBACK.detected_intent
    );

    const urgency_level = toAllowedValue(
      getRecordValue(candidate, [
        "urgency_level",
        "niveau_urgence",
        "niveau d'urgence",
        "niveau d’urgence",
      ]),
      ANALYSIS_URGENCY,
      ANALYSIS_FALLBACK.urgency_level
    );

    const detected_language = toAllowedValue(
      getRecordValue(candidate, [
        "detected_language",
        "langue_detectee",
        "langue détectée",
        "language",
      ]),
      ANALYSIS_LANGUAGES,
      ANALYSIS_FALLBACK.detected_language
    );

    const ai_suggested_status = toAllowedValue(
      getRecordValue(candidate, [
        "ai_suggested_status",
        "statut_suggere",
        "statut suggéré",
        "suggested_status",
      ]),
      ANALYSIS_STATUSES,
      ANALYSIS_FALLBACK.ai_suggested_status
    );

    const reason = asTrimmedString(
      getRecordValue(candidate, ["reason", "raison"])
    );

    if (summary) {
      return {
        summary: clampToFiveLines(summary),
        detected_intent,
        urgency_level,
        detected_language,
        ai_suggested_status,
        reason: reason ?? ANALYSIS_FALLBACK.reason,
      };
    }

    return ANALYSIS_FALLBACK;
  }

  return ANALYSIS_FALLBACK;
}

function hasRateLimitError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return /rate_limit|rate_limit_exceeded/i.test(message);
}

async function callGroqAnalysis(userPrompt: string, model: "fast" | "text") {
  return generateGroqChatCompletion({
    systemPrompt:
      'Tu es un assistant interne pour une équipe commerciale WhatsApp. Tu analyses une conversation de lead issue d’une campagne WhatsApp Ads. Tu ne réponds pas au lead. Tu produis uniquement une analyse interne. Tu dois détecter la langue du lead: fr, ar, darija_ar, en, unknown; l’intention: pricing, registration, schedule, location, programme, trainer, eligibility, callback_request, objection, not_interested, spam, unknown; le niveau d’urgence: low, normal, high; le statut suggéré: nouveau, en_cours, qualifié, rdv, à_rappeler, perdu, spam; un résumé court pour l’agent humain; une raison courte. Règles statut: "je veux m’inscrire", "réserver", "inscription" => qualifié; "appelez-moi", "contactez-moi", "je veux parler à quelqu’un" => à_rappeler; demande prix/tarif/date/lieu/programme => en_cours; "stop", "ne me contactez plus", "pas intéressé" => perdu; message abusif ou hors sujet évident => spam; premier message vague type bonjour/infos/salam => en_cours. Retourne uniquement un JSON valide: {"summary":"résumé interne court","detected_intent":"pricing | registration | schedule | location | programme | trainer | eligibility | callback_request | objection | not_interested | spam | unknown","urgency_level":"low | normal | high","detected_language":"fr | ar | darija_ar | en | unknown","ai_suggested_status":"nouveau | en_cours | qualifié | rdv | à_rappeler | perdu | spam","reason":"justification courte"}.',
    userPrompt,
    model,
  });
}

export async function analyzeConversationInternal(conversationId: string) {
  const { db } = await import("@/lib/db");

  const conversationResult = await db.query(
    `
    select
      conversations.id,
      conversations.client_id,
      conversations.status,
      contacts.profile_name,
      contacts.wa_id,
      contacts.phone
    from conversations
    inner join contacts on contacts.id = conversations.contact_id
    where conversations.id = $1
    limit 1
    `,
    [conversationId]
  );

  const conversation = conversationResult.rows[0];

  if (!conversation) {
    return null;
  }

  const messagesResult = await db.query(
    `
    select
      id,
      direction,
      message_type,
      content,
      created_at
    from messages
    where conversation_id = $1
    order by created_at asc
    limit 10
    `,
    [conversationId]
  );

  const messages = messagesResult.rows.map((message) => ({
    id: message.id,
    direction: message.direction,
    message_type: message.message_type,
    content:
      typeof message.content === "string" ? message.content.slice(0, 500) : "",
    created_at: message.created_at,
  }));

  const userPrompt = [
    "Conversation:",
    JSON.stringify(
      {
        id: conversation.id,
        status: conversation.status,
        contact: {
          profile_name: conversation.profile_name,
          wa_id: conversation.wa_id,
          phone: conversation.phone,
        },
      },
      null,
      2
    ),
    "",
    "Messages:",
    JSON.stringify(messages, null, 2),
  ].join("\n");

  let raw: unknown;

  try {
    raw = await callGroqAnalysis(userPrompt, "fast");
  } catch (error) {
    if (hasRateLimitError(error)) {
      raw = await callGroqAnalysis(userPrompt, "text");
    } else {
      throw error;
    }
  }

  const analysis = normalizeAnalysis(raw);

  await db.query(
    `
    update conversations
    set ai_summary = $1,
        detected_intent = $2,
        urgency_level = $3,
        detected_language = $4,
        ai_suggested_status = $5,
        ai_last_analysis_at = now()
    where id = $6
    `,
    [
      analysis.summary,
      analysis.detected_intent,
      analysis.urgency_level,
      analysis.detected_language,
      analysis.ai_suggested_status,
      conversationId,
    ]
  );

  return analysis;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeConversationBody;
    const conversationId = body.conversation_id?.trim();

    if (!conversationId) {
      return Response.json(
        {
          success: false,
          error: "Conversation not found",
        },
        { status: 404 }
      );
    }

    const analysis = await analyzeConversationInternal(conversationId);

    if (!analysis) {
      return Response.json(
        {
          success: false,
          error: "Conversation not found",
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Failed to analyze conversation:", error);

    return Response.json(
      {
        success: false,
        error: "Failed to analyze conversation",
      },
      { status: 500 }
    );
  }
}

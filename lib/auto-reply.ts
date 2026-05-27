import { DEFAULT_AI_SETTINGS, getAiSettings } from "@/lib/ai-settings";

type LimitedAutoReplyParams = {
  conversationId: string;
  inboundMessageId?: string;
};

type SuggestReplyResult = {
  reply: string;
  confidence: "high" | "medium" | "low";
  needs_human: boolean;
  detected_intent: string;
  suggested_status: string;
  reason: string;
};

type AutoReplyDecision = "sent" | "skipped" | "error";

type LogAutoReplyAttemptParams = {
  conversationId: string;
  messageId?: string | null;
  inboundMessageId?: string | null;
  decision: AutoReplyDecision;
  reason: string;
  detectedIntent?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  needsHuman?: boolean | null;
  reply?: string | null;
  rawPayload?: unknown;
};

type ConversationContext = {
  id: string;
  client_id: string;
  status: string;
  wa_id: string;
  phone: string | null;
  profile_name: string | null;
};

const DISALLOWED_INTENTS = new Set([
  "unknown",
  "media_received",
  "objection",
  "not_interested",
  "spam",
  "callback_request",
  "complaint",
  "medical_case",
]);

const ALLOWED_STATUSES = new Set([
  "nouveau",
  "en_cours",
  "qualifié",
  "rdv",
  "à_rappeler",
  "perdu",
  "spam",
]);

const SAFE_AUTO_REPLY_PHRASES = [
  "je ne sais pas",
  "je n'ai pas trouvé",
  "je nai pas trouvé",
  "transmettre à un conseiller",
  "transmettre a un conseiller",
  "conseiller",
  "information non disponible",
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s_:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTextMessageType(messageType: string | null | undefined) {
  return (messageType ?? "").toLowerCase() === "text";
}

function isUuid(value: string | undefined | null): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function hasUnsafePhrase(reply: string) {
  const normalizedReply = normalizeText(reply);
  return SAFE_AUTO_REPLY_PHRASES.some((phrase) =>
    normalizedReply.includes(normalizeText(phrase))
  );
}

function canonicalizeStatus(value: string) {
  const normalized = normalizeText(value);

  if (normalized === "qualifie") {
    return "qualifié";
  }

  if (normalized === "a_rappeler" || normalized === "a rappeler") {
    return "à_rappeler";
  }

  if (normalized === "en_cours") {
    return "en_cours";
  }

  if (normalized === "nouveau") {
    return "nouveau";
  }

  if (normalized === "rdv") {
    return "rdv";
  }

  if (normalized === "perdu") {
    return "perdu";
  }

  if (normalized === "spam") {
    return "spam";
  }

  return value.trim();
}

function buildUserPrompt(params: {
  history: Array<{
    direction: string;
    message_type: string;
    content: string | null;
    created_at: string;
  }>;
  lastInboundMessage: string;
  knowledgeBase: Array<{
    title: string | null;
    question: string | null;
    answer: string | null;
    category: string | null;
    keywords: string | null;
  }>;
}) {
  return [
    "Contexte conversation WhatsApp:",
    JSON.stringify(params.history, null, 2),
    "",
    "Dernier message du lead:",
    params.lastInboundMessage,
    "",
    "Base de connaissances pertinente:",
    JSON.stringify(params.knowledgeBase, null, 2),
    "",
    "Réponds uniquement avec un JSON valide conforme au format demandé.",
  ].join("\n");
}

function parseGroqJson(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```json\s*([\s\S]*?)\s*```$/i);
  const jsonText = fencedMatch?.[1] ?? trimmed;
  return JSON.parse(jsonText);
}

function normalizeSuggestion(value: unknown): SuggestReplyResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SuggestReplyResult>;

  if (
    typeof candidate.reply !== "string" ||
    !candidate.reply.trim() ||
    (candidate.confidence !== "high" &&
      candidate.confidence !== "medium" &&
      candidate.confidence !== "low") ||
    typeof candidate.needs_human !== "boolean" ||
    typeof candidate.detected_intent !== "string" ||
    typeof candidate.suggested_status !== "string" ||
    typeof candidate.reason !== "string"
  ) {
    return null;
  }

  return {
    reply: candidate.reply.trim(),
    confidence: candidate.confidence,
    needs_human: candidate.needs_human,
    detected_intent: candidate.detected_intent.trim(),
    suggested_status: canonicalizeStatus(candidate.suggested_status),
    reason: candidate.reason.trim(),
  };
}

async function getDb() {
  const { db } = await import("@/lib/db");
  return db;
}

async function logAutoReplyAttempt(entry: LogAutoReplyAttemptParams) {
  try {
    const db = await getDb();
    const safeMessageId = isUuid(entry.inboundMessageId)
      ? entry.inboundMessageId
      : null;

    console.log("Auto-reply log message id:", {
      inboundMessageId: entry.inboundMessageId,
      safeMessageId,
    });

    await db.query(
      `
      insert into auto_reply_logs
      (conversation_id, message_id, decision, reason, created_at)
      values ($1, $2, $3, $4, now())
      `,
      [entry.conversationId, safeMessageId, entry.decision, entry.reason]
    );
  } catch (error) {
    console.error("Failed to insert auto_reply_logs:", error, entry);
  }
}

function isRecentOutboundMessage(createdAt: string | Date) {
  const createdAtDate = new Date(createdAt);
  const diffMs = Date.now() - createdAtDate.getTime();
  return diffMs >= 0 && diffMs <= 2 * 60 * 1000;
}

function intentIsAllowed(intent: string, allowedAutoIntents: string[]) {
  return allowedAutoIntents.includes(intent);
}

function isKnowledgeCovered(
  knowledgeBase: Array<{
    title: string | null;
    question: string | null;
    answer: string | null;
    category: string | null;
    keywords: string | null;
  }>,
  message: string
) {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage) {
    return false;
  }

  const tokens = normalizedMessage
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);

  const expanded = new Set<string>(tokens);
  const synonymMap: Record<string, string[]> = {
    tarif: ["prix", "cout", "combien"],
    prix: ["tarif", "cout", "combien"],
    inscription: ["reserver", "participation", "modalite"],
    formation: ["masterclass", "parcours", "programme"],
    lieu: ["adresse", "ou", "setif"],
    date: ["quand", "calendrier", "planning"],
  };

  for (const token of tokens) {
    for (const synonym of synonymMap[token] ?? []) {
      expanded.add(normalizeText(synonym));
    }
  }

  const searchTokens = Array.from(expanded).filter((token) => token.length > 1);

  return knowledgeBase.some((item) => {
    const haystack = normalizeText(
      [item.title, item.category, item.question, item.answer, item.keywords]
        .filter(Boolean)
        .join(" ")
    );

    if (!haystack) {
      return false;
    }

    return searchTokens.some((token) => haystack.includes(token));
  });
}

async function generateSuggestion(params: {
  clientId: string;
  history: Array<{
    direction: string;
    message_type: string;
    content: string | null;
    created_at: string;
  }>;
  lastInboundMessage: string;
}) {
  const [{ GROQ_SYSTEM_PROMPT }, { generateGroqChatCompletion }, { getRelevantKnowledgeBase }] =
    await Promise.all([
      import("@/lib/ai-prompts"),
      import("@/lib/groq"),
      import("@/lib/knowledge-search"),
    ]);

  const knowledgeBase = await getRelevantKnowledgeBase(
    params.clientId,
    params.lastInboundMessage
  );

  if (
    !knowledgeBase.length ||
    !isKnowledgeCovered(knowledgeBase, params.lastInboundMessage)
  ) {
    return {
      suggestion: null,
      reason: "Knowledge base not sufficient",
    } as const;
  }

  const userPrompt = buildUserPrompt({
    history: params.history,
    lastInboundMessage: params.lastInboundMessage,
    knowledgeBase,
  });

  let groqContent: string;

  try {
    groqContent = await generateGroqChatCompletion({
      systemPrompt: GROQ_SYSTEM_PROMPT,
      userPrompt,
      model: "text",
    });
  } catch {
    groqContent = await generateGroqChatCompletion({
      systemPrompt: GROQ_SYSTEM_PROMPT,
      userPrompt,
      model: "fast",
    });
  }

  const parsed = parseGroqJson(groqContent);
  const suggestion = normalizeSuggestion(parsed);

  if (!suggestion) {
    return {
      suggestion: null,
      reason: "Invalid Groq suggestion",
    } as const;
  }

  return {
    suggestion,
    reason: "OK",
  } as const;
}

export async function handleLimitedAutoReply({
  conversationId,
  inboundMessageId,
}: LimitedAutoReplyParams): Promise<{
  sent: boolean;
  decision: "sent" | "skipped";
  reason: string;
}> {
  const db = await getDb();
  const settings = await getAiSettings().catch(() => DEFAULT_AI_SETTINGS);

  console.log("Limited auto-reply start:", { conversationId, inboundMessageId });
  console.log("Limited auto-reply settings:", settings);

  if (settings.mode !== "limited_auto_reply" || settings.auto_reply_enabled !== true) {
    const reason = "Auto-reply disabled";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId,
      decision: "skipped",
      reason,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  const conversationResult = await db.query(
    `
    select
      conversations.id,
      conversations.client_id,
      conversations.status,
      contacts.wa_id,
      contacts.phone,
      contacts.profile_name
    from conversations
    inner join contacts on contacts.id = conversations.contact_id
    where conversations.id = $1
    limit 1
    `,
    [conversationId]
  );

  const conversation = conversationResult.rows[0] as ConversationContext | undefined;

  if (!conversation) {
    const error = new Error("Conversation not found");
    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId,
      decision: "error",
      reason: error.message,
    });
    throw error;
  }

  const lastMessageResult = await db.query(
    `
    select
      id,
      direction,
      message_type,
      content,
      created_at
    from messages
    where conversation_id = $1
    order by created_at desc
    limit 1
    `,
    [conversationId]
  );

  const lastMessage = lastMessageResult.rows[0] as
    | {
        id: string;
        direction: string;
        message_type: string | null;
        content: string | null;
        created_at: string;
      }
    | undefined;

  if (!lastMessage || lastMessage.direction !== "inbound") {
    const reason = "No inbound message to process";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId,
      decision: "skipped",
      reason,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  if (!isTextMessageType(lastMessage.message_type)) {
    const reason = "Last inbound message is not text";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "media_received",
      confidence: "low",
      needs_human: true,
    });

    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId: inboundMessageId ?? lastMessage.id,
      decision: "skipped",
      reason,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  const recentOutboundResult = await db.query(
    `
    select id, created_at
    from messages
    where conversation_id = $1
      and direction = 'outbound'
    order by created_at desc
    limit 1
    `,
    [conversationId]
  );

  const recentOutbound = recentOutboundResult.rows[0] as
    | { id: string; created_at: string }
    | undefined;

  if (recentOutbound && isRecentOutboundMessage(recentOutbound.created_at)) {
    const reason = "Recent outbound message already sent";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId: inboundMessageId ?? lastMessage.id,
      decision: "skipped",
      reason,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  const lastInboundMessage = (lastMessage.content ?? "").trim();

  if (!lastInboundMessage) {
    const reason = "Last inbound message is empty";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId: inboundMessageId ?? lastMessage.id,
      decision: "skipped",
      reason,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  try {
    const messageHistoryResult = await db.query(
      `
      select
        direction,
        message_type,
        content,
        created_at
      from messages
      where conversation_id = $1
      order by created_at desc
      limit 10
      `,
      [conversationId]
    );

    const suggestionResult = await generateSuggestion({
      clientId: conversation.client_id,
      history: messageHistoryResult.rows
        .slice()
        .reverse()
        .map((message) => ({
          direction: message.direction,
          message_type: message.message_type,
          content: message.content,
          created_at: message.created_at,
        })),
      lastInboundMessage,
    });

    if (!suggestionResult.suggestion) {
      const reason = suggestionResult.reason;
      console.log("Limited auto-reply decision:", {
        decision: "skipped",
        reason,
        detected_intent: "unknown",
        confidence: "low",
        needs_human: true,
      });

      await logAutoReplyAttempt({
        conversationId,
        inboundMessageId: inboundMessageId ?? lastMessage.id,
        decision: "skipped",
        reason,
      });

      return {
        sent: false,
        decision: "skipped",
        reason,
      };
    }

    const suggestion = suggestionResult.suggestion;
    const normalizedIntent = normalizeText(suggestion.detected_intent);
    const canonicalSuggestedStatus = canonicalizeStatus(suggestion.suggested_status);
    const normalizedReply = suggestion.reply.trim();

    console.log("Limited auto-reply decision:", {
      detected_intent: normalizedIntent,
      confidence: suggestion.confidence,
      needs_human: suggestion.needs_human,
    });

    if (
      !normalizedReply ||
      suggestion.confidence !== "high" ||
      suggestion.needs_human ||
      DISALLOWED_INTENTS.has(normalizedIntent) ||
      !intentIsAllowed(normalizedIntent, settings.allowed_auto_intents) ||
      hasUnsafePhrase(normalizedReply)
    ) {
      const reason = "Auto-reply conditions not met";
      console.log("Limited auto-reply decision:", {
        decision: "skipped",
        reason,
        detected_intent: normalizedIntent,
        confidence: suggestion.confidence,
        needs_human: suggestion.needs_human,
      });

      await logAutoReplyAttempt({
        conversationId,
        inboundMessageId: inboundMessageId ?? lastMessage.id,
        decision: "skipped",
        reason,
      });

      return {
        sent: false,
        decision: "skipped",
        reason,
      };
    }

    const { sendWhatsAppTextMessage } = await import("@/lib/whatsapp");

    const metaPayload = await sendWhatsAppTextMessage({
      to: conversation.wa_id,
      body: normalizedReply,
    });

    const metaMessageId =
      metaPayload?.messages?.[0]?.id ??
      metaPayload?.message_id ??
      metaPayload?.messageId ??
      null;

    await db.query(
      `
      insert into messages
      (conversation_id, direction, message_type, content, whatsapp_message_id, raw_payload, status)
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        conversationId,
        "outbound",
        "text",
        normalizedReply,
        metaMessageId,
        metaPayload,
        "sent",
      ]
    );

    const shouldUpdateStatus =
      ALLOWED_STATUSES.has(canonicalSuggestedStatus) &&
      !["rdv", "perdu", "spam"].includes(normalizeText(conversation.status));

    await db.query(
      `
      update conversations
      set last_message_preview = $1,
          last_message_at = now()
          ${shouldUpdateStatus ? ", status = $2" : ""}
      where id = $3
      `,
      shouldUpdateStatus
        ? [normalizedReply, canonicalSuggestedStatus, conversationId]
        : [normalizedReply, conversationId]
    );

    const reason = suggestion.reason || "Auto-reply sent";
    console.log("Limited auto-reply decision:", {
      decision: "sent",
      reason,
      detected_intent: normalizedIntent,
      confidence: suggestion.confidence,
      needs_human: suggestion.needs_human,
    });

    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId: inboundMessageId ?? lastMessage.id,
      decision: "sent",
      reason,
    });

    return {
      sent: true,
      decision: "sent",
      reason,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Failed to send auto-reply";

    console.error("Limited auto-reply error:", error);
    console.log("Limited auto-reply decision:", {
      decision: "error",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await logAutoReplyAttempt({
      conversationId,
      inboundMessageId: inboundMessageId ?? lastMessage.id,
      decision: "error",
      reason,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }
}

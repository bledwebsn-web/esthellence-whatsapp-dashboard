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
  detected_intent?: string | null;
  confidence?: string | null;
  needs_human?: boolean | null;
  reply?: string | null;
  raw_payload?: unknown;
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

function normalizeIntent(intent: string): string {
  const normalized = normalizeText(intent);

  if (
    normalized.includes("pricing") ||
    normalized.includes("price") ||
    normalized.includes("tarif") ||
    normalized.includes("prix") ||
    normalized.includes("cout") ||
    normalized.includes("combien")
  ) {
    return "pricing";
  }

  if (
    normalized.includes("schedule") ||
    normalized.includes("date") ||
    normalized.includes("planning") ||
    normalized.includes("calendrier") ||
    normalized.includes("quand")
  ) {
    return "schedule";
  }

  if (
    normalized.includes("location") ||
    normalized.includes("lieu") ||
    normalized.includes("adresse") ||
    normalized.includes("ou") ||
    normalized.includes("où")
  ) {
    return "location";
  }

  if (
    normalized.includes("programme") ||
    normalized.includes("program") ||
    normalized.includes("contenu") ||
    normalized.includes("formation")
  ) {
    return "programme";
  }

  if (
    normalized.includes("eligibility") ||
    normalized.includes("eligible") ||
    normalized.includes("éligible") ||
    normalized.includes("pour qui") ||
    normalized.includes("medecin") ||
    normalized.includes("médecin")
  ) {
    return "eligibility";
  }

  if (
    normalized.includes("registration") ||
    normalized.includes("inscription") ||
    normalized.includes("inscrire") ||
    normalized.includes("reserver") ||
    normalized.includes("réserver")
  ) {
    return "registration";
  }

  if (
    normalized.includes("certificate") ||
    normalized.includes("certificat") ||
    normalized.includes("attestation")
  ) {
    return "certificate";
  }

  if (
    normalized.includes("greeting") ||
    normalized.includes("bonjour") ||
    normalized.includes("salam") ||
    normalized.includes("salut") ||
    normalized.includes("hello")
  ) {
    return "greeting";
  }

  return normalized;
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

async function recordAutoReplyLog(entry: LogAutoReplyAttemptParams) {
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
      (conversation_id, message_id, decision, reason, detected_intent, confidence, needs_human, reply, raw_payload, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      `,
      [
        entry.conversationId,
        safeMessageId,
        entry.decision,
        entry.reason,
        entry.detected_intent ?? null,
        entry.confidence ?? null,
        entry.needs_human ?? null,
        entry.reply ?? null,
        entry.raw_payload ?? null,
      ]
    );
  } catch (error) {
    console.error("Failed to insert auto_reply_logs:", error, entry);
  }
}

function isMessageUuid(value: string | undefined | null): boolean {
  return isUuid(value);
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
      reason: "knowledge_base_not_sufficient",
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
      reason: "unexpected_error",
    } as const;
  }

  if (!suggestion.reply.trim()) {
    return {
      suggestion: null,
      reason: "reply_empty",
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

  if (settings.mode !== "limited_auto_reply") {
    const reason = "invalid_mode";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId,
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: settings,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  if (settings.auto_reply_enabled !== true) {
    const reason = "auto_reply_disabled";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId,
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: settings,
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
    await recordAutoReplyLog({
      conversationId,
      inboundMessageId,
      decision: "error",
      reason: "unexpected_error",
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: { error: error.message },
    });
    throw error;
  }

  const lastMessageResult = await db.query(
    `
    select
      id,
      direction,
      sender_type,
      source_label,
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
        sender_type: string | null;
        source_label: string | null;
        message_type: string | null;
        content: string | null;
        created_at: string;
      }
    | undefined;

  if (!lastMessage) {
    const reason = "unexpected_error";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId: inboundMessageId ?? null,
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: { lastMessage: null },
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  const latestInboundResult = await db.query(
    `
    select
      id,
      direction,
      created_at
    from messages
    where conversation_id = $1
      and direction = 'inbound'
    order by created_at desc
    limit 1
    `,
    [conversationId]
  );

  const latestInboundMessage = latestInboundResult.rows[0] as
    | {
        id: string;
        direction: string;
        created_at: string;
      }
    | undefined;

  const providedInboundMessage = isMessageUuid(inboundMessageId)
    ? (
        await db.query(
          `
          select id, direction, message_type, content, created_at
          from messages
          where id = $1
          limit 1
          `,
          [inboundMessageId]
        )
      ).rows[0] as
        | {
            id: string;
            direction: string;
            message_type: string | null;
            content: string | null;
            created_at: string;
          }
        | undefined
    : undefined;

  const targetInboundMessage =
    providedInboundMessage?.direction === "inbound"
      ? providedInboundMessage
      : latestInboundMessage
        ? (
            await db.query(
              `
              select id, direction, message_type, content, created_at
              from messages
              where id = $1
              limit 1
              `,
              [latestInboundMessage.id]
            )
          ).rows[0]
        : undefined;

  const targetInboundId =
    targetInboundMessage?.direction === "inbound"
      ? targetInboundMessage.id
      : null;

  const targetInboundCreatedAt = targetInboundMessage?.created_at
    ? new Date(targetInboundMessage.created_at).getTime()
    : null;

  const lastOutboundResult = await db.query(
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

  const lastOutboundMessage = lastOutboundResult.rows[0] as
    | { id: string; created_at: string }
    | undefined;

  const lastOutboundCreatedAt = lastOutboundMessage
    ? new Date(lastOutboundMessage.created_at).getTime()
    : null;

  const shouldBlockForRecentOutbound =
    lastMessage.direction === "outbound" &&
    (!targetInboundCreatedAt ||
      (lastOutboundCreatedAt !== null &&
        targetInboundCreatedAt <= lastOutboundCreatedAt));

  if (shouldBlockForRecentOutbound) {
    const reason = "recent_outbound_message_already_sent";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId: targetInboundId ?? inboundMessageId ?? null,
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: { lastMessage, lastOutboundMessage, targetInboundId },
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  if (
    targetInboundId &&
    (await db.query(
      `
      select id
      from auto_reply_logs
      where message_id = $1
        and decision = 'sent'
      limit 1
      `,
      [targetInboundId]
    )).rows[0]
  ) {
    const reason = "inbound_already_auto_replied";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId: targetInboundId,
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: { targetInboundId },
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  const effectiveInboundMessage = targetInboundMessage ?? lastMessage;

  if (!effectiveInboundMessage || !isTextMessageType(effectiveInboundMessage.message_type)) {
    const reason = "last_inbound_not_text";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "media_received",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId: targetInboundId ?? inboundMessageId ?? lastMessage.id,
      decision: "skipped",
      reason,
      detected_intent: "media_received",
      confidence: "low",
      needs_human: true,
      raw_payload: { lastMessage },
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }

  const lastInboundMessage = (effectiveInboundMessage.content ?? "").trim();

  if (!lastInboundMessage) {
    const reason = "unexpected_error";
    console.log("Limited auto-reply decision:", {
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId: targetInboundId ?? inboundMessageId ?? lastMessage.id,
      decision: "skipped",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: { lastMessage },
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
      const detectedIntent =
        reason === "reply_empty" ? "unknown" : "unknown";
      console.log("Limited auto-reply decision:", {
        decision: "skipped",
        reason,
        detected_intent: detectedIntent,
        confidence: "low",
        needs_human: true,
      });

      await recordAutoReplyLog({
        conversationId,
        inboundMessageId: targetInboundId ?? inboundMessageId ?? lastMessage.id,
        decision: "skipped",
        reason,
        detected_intent: detectedIntent,
        confidence: "low",
        needs_human: true,
        raw_payload: suggestionResult,
      });

      return {
        sent: false,
        decision: "skipped",
        reason,
      };
    }

    const suggestion = suggestionResult.suggestion;
    const normalizedIntent = normalizeIntent(suggestion.detected_intent);
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
      let reason = "intent_not_allowed";

      if (!normalizedReply) {
        reason = "reply_empty";
      } else if (suggestion.confidence !== "high") {
        reason = "confidence_not_high";
      } else if (suggestion.needs_human) {
        reason = "needs_human_true";
      } else if (hasUnsafePhrase(normalizedReply)) {
        reason = "reply_contains_blocked_phrase";
      } else if (DISALLOWED_INTENTS.has(normalizedIntent)) {
        reason = "intent_not_allowed";
      } else if (!intentIsAllowed(normalizedIntent, settings.allowed_auto_intents)) {
        reason = "intent_not_allowed";
      }

      console.log("Limited auto-reply decision:", {
        decision: "skipped",
        reason,
        detected_intent: normalizedIntent,
        confidence: suggestion.confidence,
        needs_human: suggestion.needs_human,
      });

      await recordAutoReplyLog({
        conversationId,
        inboundMessageId: targetInboundId ?? inboundMessageId ?? lastMessage.id,
        decision: "skipped",
        reason,
        detected_intent: normalizedIntent,
        confidence: suggestion.confidence,
        needs_human: suggestion.needs_human,
        reply: normalizedReply,
        raw_payload: suggestion,
      });

      return {
        sent: false,
        decision: "skipped",
        reason,
      };
    }

    try {
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
        (conversation_id, direction, message_type, content, whatsapp_message_id, raw_payload, sender_type, source_label, delivery_status, status)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          conversationId,
          "outbound",
          "text",
          normalizedReply,
          metaMessageId,
          metaPayload,
          "ai",
          "WABAssist",
          "sent",
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

      const reason = suggestion.reason || "sent";
      console.log("Limited auto-reply decision:", {
        decision: "sent",
        reason,
        detected_intent: normalizedIntent,
        confidence: suggestion.confidence,
        needs_human: suggestion.needs_human,
      });

      await recordAutoReplyLog({
        conversationId,
        inboundMessageId: targetInboundId ?? inboundMessageId ?? lastMessage.id,
        decision: "sent",
        reason: "auto_reply_conditions_met",
        detected_intent: normalizedIntent,
        confidence: suggestion.confidence,
        needs_human: suggestion.needs_human,
        reply: normalizedReply,
        raw_payload: metaPayload,
      });

      return {
        sent: true,
        decision: "sent",
        reason: "auto_reply_conditions_met",
      };
    } catch (error) {
      const reason = "send_error";

      console.error("Limited auto-reply send error:", error);
      console.log("Limited auto-reply decision:", {
        decision: "skipped",
        reason,
        detected_intent: normalizedIntent,
        confidence: suggestion.confidence,
        needs_human: suggestion.needs_human,
      });

      await recordAutoReplyLog({
        conversationId,
        inboundMessageId: targetInboundId ?? inboundMessageId ?? lastMessage.id,
        decision: "error",
        reason,
        detected_intent: normalizedIntent,
        confidence: suggestion.confidence,
        needs_human: suggestion.needs_human,
        reply: normalizedReply,
        raw_payload: error,
      });

      return {
        sent: false,
        decision: "skipped",
        reason,
      };
    }
  } catch (error) {
    const reason = "unexpected_error";

    console.error("Limited auto-reply error:", error);
    console.log("Limited auto-reply decision:", {
      decision: "error",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
    });

    await recordAutoReplyLog({
      conversationId,
      inboundMessageId: targetInboundId ?? inboundMessageId ?? lastMessage.id,
      decision: "error",
      reason,
      detected_intent: "unknown",
      confidence: "low",
      needs_human: true,
      raw_payload: error,
    });

    return {
      sent: false,
      decision: "skipped",
      reason,
    };
  }
}

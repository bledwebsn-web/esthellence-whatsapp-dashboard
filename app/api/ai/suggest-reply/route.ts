import { db } from "@/lib/db";
import { GROQ_SYSTEM_PROMPT } from "@/lib/ai-prompts";
import { generateGroqChatCompletion } from "@/lib/groq";
import { getRelevantKnowledgeBase } from "@/lib/knowledge-search";

type SuggestReplyBody = {
  conversation_id?: string;
};

type SuggestReplyResult = {
  reply: string;
  confidence: "high" | "medium" | "low";
  needs_human: boolean;
  detected_intent: string;
  suggested_status: "nouveau" | "en_cours" | "qualifié" | "rdv" | "à_rappeler" | "perdu";
  reason: string;
};

const FALLBACK_REPLY: SuggestReplyResult = {
  reply:
    "Je préfère transmettre votre demande à un conseiller afin de vous donner une réponse exacte. Pouvez-vous préciser votre besoin ?",
  confidence: "low",
  needs_human: true,
  detected_intent: "unknown",
  suggested_status: "en_cours",
  reason: "Réponse IA non exploitable",
};

function normalizeResult(value: unknown): SuggestReplyResult | null {
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
    detected_intent: candidate.detected_intent,
    suggested_status: candidate.suggested_status as SuggestReplyResult["suggested_status"],
    reason: candidate.reason,
  };
}

function parseGroqJson(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```json\s*([\s\S]*?)\s*```$/i);
  const jsonText = fencedMatch?.[1] ?? trimmed;
  return JSON.parse(jsonText);
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SuggestReplyBody;
    const conversationId = body.conversation_id?.trim();

    if (!conversationId) {
      return Response.json(FALLBACK_REPLY, { status: 400 });
    }

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
      return Response.json(FALLBACK_REPLY, { status: 404 });
    }

    const messagesResult = await db.query(
      `
      select
        id,
        direction,
        message_type,
        content,
        whatsapp_message_id,
        status,
        created_at
      from messages
      where conversation_id = $1
      order by created_at desc
      limit 10
      `,
      [conversationId]
    );

    const history = messagesResult.rows.reverse();
    const inboundMessages = history.filter((message) => message.direction === "inbound");
    const lastInboundMessage =
      inboundMessages[inboundMessages.length - 1]?.content?.trim() ||
      history[history.length - 1]?.content?.trim() ||
      "";

    const knowledgeBase = await getRelevantKnowledgeBase(
      conversation.client_id,
      lastInboundMessage
    );

    const userPrompt = buildUserPrompt({
      history,
      lastInboundMessage,
      knowledgeBase,
    });

    let groqContent: string;

    try {
      groqContent = await generateGroqChatCompletion({
        systemPrompt: GROQ_SYSTEM_PROMPT,
        userPrompt,
        model: "text",
      });
    } catch (primaryError) {
      groqContent = await generateGroqChatCompletion({
        systemPrompt: GROQ_SYSTEM_PROMPT,
        userPrompt,
        model: "fast",
      });
    }

    let parsed: unknown;

    try {
      parsed = parseGroqJson(groqContent);
    } catch (parseError) {
      return Response.json(FALLBACK_REPLY);
    }

    const normalized = normalizeResult(parsed);

    if (!normalized) {
      return Response.json(FALLBACK_REPLY);
    }

    return Response.json(normalized);
  } catch (error) {
    console.error("Failed to generate AI suggestion:", error);

    return Response.json(FALLBACK_REPLY, { status: 200 });
  }
}

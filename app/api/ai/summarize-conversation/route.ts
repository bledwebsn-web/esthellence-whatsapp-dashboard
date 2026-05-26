import { db } from "@/lib/db";
import { generateGroqChatCompletion } from "@/lib/groq";

type SummarizeConversationBody = {
  conversation_id?: string;
};

function buildStructuredSummary(candidate: Record<string, unknown>): string {
  const need =
    candidate["besoin principal"] ??
    candidate["besoin_principal"] ??
    candidate["besoin"] ??
    candidate["main_need"];

  const info =
    candidate["informations déjà données"] ??
    candidate["informations deja donnees"] ??
    candidate["infos données"] ??
    candidate["infos donnees"] ??
    candidate["informations"] ??
    candidate["given_information"];

  const interest =
    candidate["niveau d'intérêt"] ??
    candidate["niveau d’interet"] ??
    candidate["niveau d'interet"] ??
    candidate["niveau_interet"] ??
    candidate["interest_level"];

  const questions =
    candidate["objections ou questions restantes"] ??
    candidate["objections"] ??
    candidate["questions restantes"] ??
    candidate["remaining_questions"];

  const nextAction =
    candidate["prochaine action recommandée"] ??
    candidate["prochaine action recommandee"] ??
    candidate["prochaine_action"] ??
    candidate["next_action"];

  const lines: string[] = [];

  if (typeof need === "string" && need.trim()) {
    lines.push(`Besoin : ${need.trim()}`);
  }

  if (typeof info === "string" && info.trim()) {
    lines.push(`Infos données : ${info.trim()}`);
  }

  if (typeof interest === "string" && interest.trim()) {
    lines.push(`Niveau d’intérêt : ${interest.trim()}`);
  }

  if (typeof questions === "string" && questions.trim()) {
    lines.push(`Questions restantes : ${questions.trim()}`);
  }

  if (typeof nextAction === "string" && nextAction.trim()) {
    lines.push(`Prochaine action : ${nextAction.trim()}`);
  }

  return lines.join("\n");
}

function normalizeSummary(raw: unknown): string {
  const fallback = "Résumé indisponible. Relecture humaine recommandée.";

  if (typeof raw === "string") {
    const trimmed = raw.trim();

    try {
      const parsed = JSON.parse(trimmed);
      return normalizeSummary(parsed);
    } catch {
      if (trimmed && trimmed !== "[object Object]") {
        return trimmed;
      }

      return fallback;
    }
  }

  if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;

    if (typeof candidate.summary === "string" && candidate.summary.trim()) {
      return candidate.summary.trim();
    }

    const structured = buildStructuredSummary(candidate);

    if (structured.trim()) {
      return structured.trim();
    }
  }

  return fallback;
}

function clampToFiveLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
}

function hasRateLimitError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return /rate_limit|rate_limit_exceeded/i.test(message);
}

async function callGroqSummary(userPrompt: string, model: "fast" | "text") {
  return generateGroqChatCompletion({
    systemPrompt:
      'Tu es un assistant interne pour une equipe commerciale WhatsApp. Retourne uniquement ce JSON valide: {"besoin principal":"string","informations déjà données":"string","niveau d\'intérêt":"string","objections ou questions restantes":"string","prochaine action recommandée":"string"}. Retourne uniquement un JSON valide. Pas de markdown. Pas de texte avant ou après le JSON.',
    userPrompt,
    model,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SummarizeConversationBody;
    const conversationId = body.conversation_id?.trim();

    if (!conversationId) {
      return Response.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversationResult = await db.query(
      `
      select
        conversations.id,
        conversations.ai_summary,
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
      return Response.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
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
      order by created_at desc
      limit 8
      `,
      [conversationId]
    );

    const messages = messagesResult.rows
      .reverse()
      .map((message) => ({
        id: message.id,
        direction: message.direction,
        message_type: message.message_type,
        content: typeof message.content === "string" ? message.content.slice(0, 500) : "",
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
      "",
      "Retourne uniquement le JSON demandé. Pas de markdown. Pas de texte avant ou après le JSON.",
    ].join("\n");

    let raw: unknown;

    try {
      raw = await callGroqSummary(userPrompt, "fast");
    } catch (error) {
      if (hasRateLimitError(error)) {
        raw = await callGroqSummary(userPrompt, "text");
      } else {
        throw error;
      }
    }

    console.log("Groq summary raw:", raw);

    let summaryText = clampToFiveLines(normalizeSummary(raw)).trim();

    if (!summaryText || summaryText === "[object Object]") {
      summaryText = "Résumé indisponible. Relecture humaine recommandée.";
    }

    console.log("Groq summary final:", summaryText);

    await db.query(
      `
      update conversations
      set ai_summary = $1
      where id = $2
      `,
      [summaryText, conversationId]
    );

    return Response.json({
      success: true,
      summary: summaryText,
    });
  } catch (error) {
    console.error("Failed to summarize conversation:", error);

    return Response.json(
      {
        success: false,
        error: "Failed to summarize conversation",
      },
      { status: 500 }
    );
  }
}

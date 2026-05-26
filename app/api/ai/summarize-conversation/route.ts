import { db } from "@/lib/db";
import { generateGroqChatCompletion } from "@/lib/groq";

type SummarizeConversationBody = {
  conversation_id?: string;
};

function normalizeSummary(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();

    try {
      const parsed = JSON.parse(trimmed);

      if (typeof parsed === "string") {
        return parsed.trim();
      }

      if (
        parsed &&
        typeof parsed === "object" &&
        "summary" in parsed &&
        typeof (parsed as { summary?: unknown }).summary === "string"
      ) {
        return (parsed as { summary: string }).summary.trim();
      }

      return "Résumé indisponible. Relecture humaine recommandée.";
    } catch {
      return trimmed;
    }
  }

  if (
    raw &&
    typeof raw === "object" &&
    "summary" in raw &&
    typeof (raw as { summary?: unknown }).summary === "string"
  ) {
    return (raw as { summary: string }).summary.trim();
  }

  return "Résumé indisponible. Relecture humaine recommandée.";
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
      "Tu es un assistant interne pour une equipe commerciale WhatsApp. Resume la conversation pour aider un agent humain. Le resume doit etre court, clair et exploitable. Inclure le besoin principal du lead, les informations deja donnees, le niveau d'interet, les objections ou questions restantes, et la prochaine action recommande. Ne pas inventer d'informations. Ne pas ajouter d'informations qui ne sont pas dans la conversation. Ne pas ecrire au lead. Ecrire pour l'agent interne. Maximum 5 lignes. Retourne uniquement le resume en texte brut. Pas de JSON. Pas de markdown.",
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
        content:
          typeof message.content === "string"
            ? message.content.slice(0, 500)
            : message.content == null
              ? ""
              : String(message.content).slice(0, 500),
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
      "Retourne uniquement le résumé en texte brut. Pas de JSON. Pas de markdown.",
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

    let summaryText = normalizeSummary(raw);
    summaryText = clampToFiveLines(summaryText).trim();

    if (summaryText === "[object Object]") {
      summaryText = "Résumé indisponible. Relecture humaine recommandée.";
    }

    if (!summaryText) {
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

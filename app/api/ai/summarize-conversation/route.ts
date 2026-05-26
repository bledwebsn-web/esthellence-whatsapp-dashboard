import { db } from "@/lib/db";
import { generateGroqChatCompletion } from "@/lib/groq";

type SummarizeConversationBody = {
  conversation_id?: string;
};

function stripCodeFences(value: string) {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function clampToFiveLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
}

function safeExtractSummary(raw: unknown): string {
  const fallback = "Résumé indisponible. Relecture humaine recommandée.";

  if (typeof raw === "string") {
    const cleaned = stripCodeFences(raw);

    try {
      const parsed = JSON.parse(cleaned) as unknown;
      return safeExtractSummary(parsed);
    } catch {
      return clampToFiveLines(cleaned || fallback) || fallback;
    }
  }

  if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;

    if (typeof candidate.summary === "string") {
      return clampToFiveLines(candidate.summary.trim()) || fallback;
    }

    const parts: string[] = [];
    const push = (label: string, value: unknown) => {
      if (typeof value === "string" && value.trim()) {
        parts.push(`${label}: ${value.trim()}`);
      }
    };

    push("Besoin", candidate.need ?? candidate.main_need ?? candidate.goal);
    push(
      "Infos données",
      candidate.shared_information ??
        candidate.provided_information ??
        candidate.information
    );
    push("Intérêt", candidate.interest_level ?? candidate.interest ?? candidate.engagement);
    push("Objections", candidate.objections ?? candidate.questions_remaining);
    push(
      "Prochaine action",
      candidate.next_action ?? candidate.recommended_next_step ?? candidate.action
    );

    if (parts.length > 0) {
      return clampToFiveLines(parts.join("\n")) || fallback;
    }
  }

  return fallback;
}

function hasRateLimitError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return /rate_limit|rate_limit_exceeded/i.test(message);
}

async function callGroqSummary(userPrompt: string, model: "fast" | "text") {
  const raw = await generateGroqChatCompletion({
    systemPrompt:
      'Tu es un assistant interne pour une equipe commerciale WhatsApp. Resume la conversation pour aider un agent humain. Le resume doit etre court, clair et exploitable. Inclure le besoin principal du lead, les informations deja donnees, le niveau d\'interet, les objections ou questions restantes, et la prochaine action recommande. Ne pas inventer d\'informations. Ne pas ajouter d\'informations qui ne sont pas dans la conversation. Ne pas ecrire au lead. Ecrire pour l\'agent interne. Maximum 5 lignes. Retourne uniquement un JSON valide avec la forme {"summary":"texte court du resume"}.',
    userPrompt,
    model,
  });

  console.log("Groq summary raw:", raw);

  const summaryText = safeExtractSummary(raw);
  console.log("Groq summary text:", summaryText);

  return summaryText;
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

    const userPrompt = JSON.stringify(
      {
        conversation: {
          id: conversation.id,
          status: conversation.status,
          contact: {
            profile_name: conversation.profile_name,
            wa_id: conversation.wa_id,
            phone: conversation.phone,
          },
        },
        messages,
        instructions:
          'Return only JSON in the format {"summary":"texte court du resume"} and keep it to at most 5 lines.',
      },
      null,
      2
    );

    let summaryText: string;

    try {
      summaryText = await callGroqSummary(userPrompt, "fast");
    } catch (error) {
      if (hasRateLimitError(error)) {
        summaryText = await callGroqSummary(userPrompt, "text");
      } else {
        throw error;
      }
    }

    summaryText = clampToFiveLines(summaryText).trim();

    if (!summaryText) {
      summaryText = "Résumé indisponible. Relecture humaine recommandée.";
    }

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

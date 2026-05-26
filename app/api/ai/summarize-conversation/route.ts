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
        whatsapp_message_id,
        status,
        created_at
      from messages
      where conversation_id = $1
      order by created_at asc
      `,
      [conversationId]
    );

    const messages = messagesResult.rows;

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
        messages: messages.map((message) => ({
          id: message.id,
          direction: message.direction,
          message_type: message.message_type,
          content: message.content,
          created_at: message.created_at,
        })),
        instructions:
          'Return only JSON in the format {"summary":"..."} and keep it to at most 5 lines.',
      },
      null,
      2
    );

    const groqContent = await generateGroqChatCompletion({
      systemPrompt:
        "Tu es un assistant interne pour une equipe commerciale WhatsApp. Resumes la conversation pour aider un agent humain. Le resume doit etre court, clair et exploitable. Inclure le besoin principal du lead, les informations deja donnees, le niveau d'interet, les objections ou questions restantes, et la prochaine action recommande. Ne pas inventer d'informations. Ne pas ajouter d'informations qui ne sont pas dans la conversation. Ne pas ecrire au lead. Ecrire pour l'agent interne. Maximum 5 lignes. Retourne uniquement un JSON valide.",
      userPrompt,
      model: "fast",
    });

    const parsed = JSON.parse(stripCodeFences(groqContent)) as {
      summary?: string;
    };

    const summary = String(parsed.summary ?? "").trim();

    if (!summary) {
      throw new Error("Groq summary was empty");
    }

    await db.query(
      `
      update conversations
      set ai_summary = $1
      where id = $2
      `,
      [summary, conversationId]
    );

    return Response.json({
      success: true,
      summary,
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

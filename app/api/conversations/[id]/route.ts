import { db } from "@/lib/db";

type ConversationMessageRow = {
  id: string;
  direction: string;
  message_type: string;
  content: string | null;
  whatsapp_message_id: string | null;
  status: string | null;
  created_at: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const conversationResult = await db.query(
      `
      select
        conv.id,
        conv.status,
        conv.ai_summary,
        conv.detected_intent,
        conv.urgency_level,
        conv.human_takeover,
        contacts.profile_name,
        contacts.wa_id,
        contacts.phone
      from conversations conv
      inner join contacts on contacts.id = conv.contact_id
      where conv.id = $1
      limit 1
      `,
      [id]
    );

    const conversation = conversationResult.rows[0];

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messagesResult = await db.query<ConversationMessageRow>(
      `
      select
        messages.id,
        messages.direction,
        messages.message_type,
        messages.content,
        messages.whatsapp_message_id,
        messages.status,
        messages.created_at
      from messages
      where messages.conversation_id = $1
      order by messages.created_at asc
      `,
      [id]
    );

    return Response.json({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        ai_summary: conversation.ai_summary,
        detected_intent: conversation.detected_intent,
        urgency_level: conversation.urgency_level,
        human_takeover: conversation.human_takeover,
        contact: {
          profile_name: conversation.profile_name,
          wa_id: conversation.wa_id,
          phone: conversation.phone,
        },
        messages: messagesResult.rows,
      },
    });
  } catch (error) {
    console.error("Failed to fetch conversation:", error);

    return Response.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

import { db } from "@/lib/db";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";

type SendMessageBody = {
  conversation_id?: string;
  message?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendMessageBody;
    const conversationId = body.conversation_id?.trim();
    const message = body.message?.trim();

    if (!conversationId || !message) {
      return Response.json(
        {
          success: false,
          error: "Failed to send WhatsApp message",
        },
        { status: 400 }
      );
    }

    const conversationResult = await db.query(
      `
      select
        conversations.id,
        contacts.wa_id
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
        {
          success: false,
          error: "Failed to send WhatsApp message",
        },
        { status: 404 }
      );
    }

    const metaResponse = await sendWhatsAppTextMessage({
      to: conversation.wa_id,
      body: message,
    });

    const whatsappMessageId = metaResponse?.messages?.[0]?.id ?? null;

    await db.query(
      `
      insert into messages
      (
        conversation_id,
        direction,
        message_type,
        content,
        whatsapp_message_id,
        status,
        raw_payload
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        conversationId,
        "outbound",
        "text",
        message,
        whatsappMessageId,
        "sent",
        metaResponse,
      ]
    );

    await db.query(
      `
      update conversations
      set last_message_at = now(),
          last_message_preview = $1
      where id = $2
      `,
      [message, conversationId]
    );

    return Response.json({
      success: true,
      message: {
        content: message,
        direction: "outbound",
      },
      meta: metaResponse,
    });
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);

    return Response.json(
      {
        success: false,
        error: "Failed to send WhatsApp message",
      },
      { status: 500 }
    );
  }
}

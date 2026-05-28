import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function normalizeSenderType(
  direction: string,
  senderType: string | null,
  sourceLabel: string | null
) {
  if ((sourceLabel ?? "").trim() === "WABAssist") {
    return "ai";
  }

  if (senderType && senderType.trim()) {
    return senderType;
  }

  return direction === "inbound" ? "lead" : "human";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await db.query(
      `
      select
        id,
        conversation_id,
        direction,
        message_type,
        content,
        whatsapp_message_id,
        status,
        delivery_status,
        delivered_at,
        read_at,
        sender_type,
        source_label,
        media_id,
        media_url,
        media_mime_type,
        media_filename,
        media_size,
        created_at
      from messages
      where conversation_id = $1
      order by created_at asc
      `,
      [id]
    );

    const messages = result.rows.map((message) => {
      const senderType = normalizeSenderType(
        message.direction,
        message.sender_type,
        message.source_label
      );
      const deliveryStatus =
        message.delivery_status ??
        message.status ??
        (message.direction === "outbound" ? "sent" : null);

      return {
        id: message.id,
        conversation_id: message.conversation_id,
        direction: message.direction,
        message_type: message.message_type,
        content: message.content,
        whatsapp_message_id: message.whatsapp_message_id,
        status: message.status,
        delivery_status: deliveryStatus,
        delivered_at: message.delivered_at,
        read_at: message.read_at,
        sender_type: senderType,
        source_label: message.source_label,
        media_id: message.media_id,
        media_url: message.media_url,
        media_mime_type: message.media_mime_type,
        media_filename: message.media_filename,
        media_size: message.media_size,
        created_at: message.created_at,
      };
    });

    return Response.json({
      success: true,
      messages,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch conversation messages:", error);
    return Response.json(
      {
        success: false,
        error: "Failed to fetch conversation messages",
      },
      { status: 500 }
    );
  }
}

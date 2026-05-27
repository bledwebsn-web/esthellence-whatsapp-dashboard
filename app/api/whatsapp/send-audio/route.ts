import { db } from "@/lib/db";

function getMetaApiBase() {
  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is missing");
  }

  return {
    version,
    phoneNumberId,
  };
}

async function readJsonResponse(response: Response) {
  return response.json().catch(() => null);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const conversationId = String(formData.get("conversation_id") ?? "").trim();
    const audio = formData.get("audio");

    if (!conversationId || !(audio instanceof File) || audio.size === 0) {
      return Response.json(
        {
          success: false,
          error: "Failed to send audio message",
        },
        { status: 400 }
      );
    }

    const conversationResult = await db.query(
      `
      select
        conversations.id,
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
        {
          success: false,
          error: "Failed to send audio message",
        },
        { status: 404 }
      );
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      throw new Error("WHATSAPP_ACCESS_TOKEN is missing");
    }

    const { version, phoneNumberId } = getMetaApiBase();
    const uploadFormData = new FormData();
    uploadFormData.append("messaging_product", "whatsapp");
    uploadFormData.append("file", audio);
    uploadFormData.append("type", audio.type || "audio/webm");

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadFormData,
      }
    );

    const uploadPayload = await readJsonResponse(uploadResponse);

    if (!uploadResponse.ok) {
      throw new Error(
        `Meta audio upload failed: ${JSON.stringify(uploadPayload)}`
      );
    }

    const mediaId = uploadPayload?.id ?? null;
    if (!mediaId) {
      throw new Error("Meta audio upload did not return a media id");
    }

    const recipient = conversation.wa_id || conversation.phone;
    if (!recipient) {
      throw new Error("Recipient number is missing");
    }

    const messageResponse = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "audio",
          audio: {
            id: mediaId,
          },
        }),
      }
    );

    const messagePayload = await readJsonResponse(messageResponse);

    if (!messageResponse.ok) {
      throw new Error(
        `Meta audio message failed: ${JSON.stringify(messagePayload)}`
      );
    }

    const whatsappMessageId = messagePayload?.messages?.[0]?.id ?? null;
    const savedMessageResult = await db.query(
      `
      insert into messages
      (
        conversation_id,
        direction,
        message_type,
        content,
        whatsapp_message_id,
        status,
        delivery_status,
        sender_type,
        source_label,
        raw_payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning
        id,
        conversation_id,
        direction,
        message_type,
        content,
        whatsapp_message_id,
        status,
        delivery_status,
        sender_type,
        source_label,
        created_at
      `,
      [
        conversationId,
        "outbound",
        "audio",
        "[audio]",
        whatsappMessageId,
        "sent",
        "sent",
        "human",
        null,
        {
          media_upload: uploadPayload,
          message_send: messagePayload,
        },
      ]
    );

    await db.query(
      `
      update conversations
      set last_message_at = now(),
          last_message_preview = $1
      where id = $2
      `,
      ["[audio]", conversationId]
    );

    return Response.json({
      success: true,
      message: savedMessageResult.rows[0],
      meta: {
        media_upload: uploadPayload,
        message_send: messagePayload,
      },
    });
  } catch (error) {
    console.error("Failed to send audio message:", error);

    return Response.json(
      {
        success: false,
        error: "Failed to send audio message",
      },
      { status: 500 }
    );
  }
}

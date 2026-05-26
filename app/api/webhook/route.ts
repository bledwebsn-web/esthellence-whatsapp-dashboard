import { analyzeConversationInternal } from "../ai/analyze-conversation/route";
import { handleLimitedAutoReply } from "@/lib/auto-reply";
import { db } from "@/lib/db";

const DEFAULT_CLIENT_NAME = "Esthellence";
const DEFAULT_CAMPAIGN_NAME = "Campagne WhatsApp Ads Esthellence";

async function getOrCreateClient() {
  const existing = await db.query(
    "select id from clients where name = $1 limit 1",
    [DEFAULT_CLIENT_NAME]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id as string;
  }

  const created = await db.query(
    "insert into clients (name, business_name) values ($1, $2) returning id",
    [DEFAULT_CLIENT_NAME, "Clinique Esthellence"]
  );

  return created.rows[0].id as string;
}

async function getOrCreateCampaign(clientId: string) {
  const existing = await db.query(
    "select id from campaigns where client_id = $1 and name = $2 limit 1",
    [clientId, DEFAULT_CAMPAIGN_NAME]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id as string;
  }

  const created = await db.query(
    "insert into campaigns (client_id, name, source, status) values ($1, $2, $3, $4) returning id",
    [clientId, DEFAULT_CAMPAIGN_NAME, "meta_click_to_whatsapp", "active"]
  );

  return created.rows[0].id as string;
}

async function getOrCreateContact({
  clientId,
  waId,
  profileName,
}: {
  clientId: string;
  waId: string;
  profileName: string | null;
}) {
  const existing = await db.query(
    "select id from contacts where client_id = $1 and wa_id = $2 limit 1",
    [clientId, waId]
  );

  if (existing.rows[0]) {
    await db.query(
      "update contacts set profile_name = coalesce($1, profile_name), phone = coalesce($2, phone) where id = $3",
      [profileName, waId, existing.rows[0].id]
    );

    return existing.rows[0].id as string;
  }

  const created = await db.query(
    "insert into contacts (client_id, wa_id, phone, profile_name) values ($1, $2, $3, $4) returning id",
    [clientId, waId, waId, profileName]
  );

  return created.rows[0].id as string;
}

async function getOrCreateConversation({
  clientId,
  contactId,
  campaignId,
}: {
  clientId: string;
  contactId: string;
  campaignId: string;
}) {
  const existing = await db.query(
    `
    select id
    from conversations
    where client_id = $1
      and contact_id = $2
      and status not in ('perdu', 'spam')
    order by created_at desc
    limit 1
    `,
    [clientId, contactId]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id as string;
  }

  const created = await db.query(
    "insert into conversations (client_id, contact_id, campaign_id, status) values ($1, $2, $3, $4) returning id",
    [clientId, contactId, campaignId, "nouveau"]
  );

  return created.rows[0].id as string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    console.log("WhatsApp webhook payload:", JSON.stringify(payload, null, 2));

    const entry = payload.entry?.[0];
    const wabaId = entry?.id ?? null;
    const change = entry?.changes?.[0];
    const value = change?.value;
    const field = change?.field ?? null;

    const phoneNumberId = value?.metadata?.phone_number_id ?? null;
    const messages = value?.messages ?? [];
    const contact = value?.contacts?.[0];

    const eventResult = await db.query(
      `
      insert into webhook_events
      (source, event_type, phone_number_id, waba_id, raw_payload, processed)
      values ($1, $2, $3, $4, $5, $6)
      returning id
      `,
      ["whatsapp", field, phoneNumberId, wabaId, payload, false]
    );

    const webhookEventId = eventResult.rows[0].id as string;

    if (!messages.length) {
      return Response.json({ received: true, message_saved: false });
    }

    const message = messages[0];

    const waId = contact?.wa_id ?? message.from;
    const profileName = contact?.profile?.name ?? null;
    const messageType = message.type ?? "unknown";
    const messageContent =
      messageType === "text" ? message.text?.body ?? "" : `[${messageType}]`;

    const clientId = await getOrCreateClient();
    const campaignId = await getOrCreateCampaign(clientId);

    const contactId = await getOrCreateContact({
      clientId,
      waId,
      profileName,
    });

    const conversationId = await getOrCreateConversation({
      clientId,
      contactId,
      campaignId,
    });

    await db.query(
      `
      insert into messages
      (conversation_id, direction, message_type, content, whatsapp_message_id, raw_payload)
      values ($1, $2, $3, $4, $5, $6)
      `,
      [
        conversationId,
        "inbound",
        messageType,
        messageContent,
        message.id ?? null,
        payload,
      ]
    );

    await db.query(
      `
      update conversations
      set last_message_at = now(),
          last_message_preview = $1
      where id = $2
      `,
      [messageContent, conversationId]
    );

    await db.query("update webhook_events set processed = true where id = $1", [
      webhookEventId,
    ]);

    void analyzeConversationInternal(conversationId)
      .then(() =>
        handleLimitedAutoReply({
          conversationId,
          inboundMessageId: message.id ?? undefined,
        }).catch((error) => {
          console.error("Limited auto-reply failed:", error);
        })
      )
      .catch((error) => {
        console.error("Auto analysis failed:", error);
      });

    return Response.json({
      received: true,
      message_saved: true,
      conversation_id: conversationId,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    return Response.json(
      {
        received: false,
        error: "Webhook processing failed",
      },
      { status: 200 }
    );
  }
}

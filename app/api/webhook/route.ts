export const runtime = "nodejs";

import { analyzeConversationInternal } from "../ai/analyze-conversation/route";
import { handleLimitedAutoReply } from "@/lib/auto-reply";
import { db } from "@/lib/db";
import {
  downloadWhatsAppMedia,
  getWhatsAppMediaExtension,
  getWhatsAppMediaInfo,
  sanitizeWhatsAppFileName,
} from "@/lib/whatsapp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

function normalizeInboundMessageType(messageType: string | null | undefined) {
  const normalized = (messageType ?? "").toLowerCase();
  if (normalized === "voice") return "audio";
  return normalized || "unknown";
}

function getInboundMediaObject(message: Record<string, unknown>) {
  return (
    (message.image as Record<string, unknown> | undefined) ??
    (message.audio as Record<string, unknown> | undefined) ??
    (message.voice as Record<string, unknown> | undefined) ??
    (message.document as Record<string, unknown> | undefined) ??
    (message.video as Record<string, unknown> | undefined) ??
    (message.sticker as Record<string, unknown> | undefined) ??
    null
  );
}

function getInboundMediaCaption(message: Record<string, unknown>) {
  const image = message.image as Record<string, unknown> | undefined;
  const video = message.video as Record<string, unknown> | undefined;
  const document = message.document as Record<string, unknown> | undefined;

  return (
    (typeof image?.caption === "string" && image.caption) ||
    (typeof video?.caption === "string" && video.caption) ||
    (typeof document?.caption === "string" && document.caption) ||
    null
  );
}

function getInboundMediaFilename(message: Record<string, unknown>) {
  const document = message.document as Record<string, unknown> | undefined;
  const image = message.image as Record<string, unknown> | undefined;
  const video = message.video as Record<string, unknown> | undefined;
  const audio = message.audio as Record<string, unknown> | undefined;
  const voice = message.voice as Record<string, unknown> | undefined;
  const sticker = message.sticker as Record<string, unknown> | undefined;

  return (
    (typeof document?.filename === "string" && document.filename) ||
    (typeof image?.filename === "string" && image.filename) ||
    (typeof video?.filename === "string" && video.filename) ||
    (typeof audio?.filename === "string" && audio.filename) ||
    (typeof voice?.filename === "string" && voice.filename) ||
    (typeof sticker?.filename === "string" && sticker.filename) ||
    null
  );
}

async function saveMediaBufferToPublic(params: {
  buffer: Buffer;
  mimeType: string;
  baseName: string;
  fallbackType: string;
}) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const relativeDir = path.join("uploads", "whatsapp", year, month);
  const absoluteDir = path.join(process.cwd(), "public", relativeDir);
  const extension = getWhatsAppMediaExtension(params.mimeType, params.fallbackType);
  const safeBaseName = sanitizeWhatsAppFileName(params.baseName);
  const savedFileName = `${safeBaseName}.${extension}`;
  const absolutePath = path.join(absoluteDir, savedFileName);
  const mediaUrl = `/${path.posix.join(relativeDir.split(path.sep).join("/"), savedFileName)}`;

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, params.buffer);

  return {
    mediaUrl,
    savedFileName,
    mediaSize: params.buffer.length,
  };
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
    const statuses = value?.statuses ?? [];
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

    if (Array.isArray(statuses) && statuses.length > 0) {
      for (const status of statuses) {
        const whatsappMessageId = status?.id ?? null;
        const incomingStatus = status?.status ?? null;

        if (whatsappMessageId && incomingStatus) {
          const currentResult = await db.query(
            `
            select delivery_status, read_at, delivered_at
            from messages
            where whatsapp_message_id = $1
            limit 1
            `,
            [whatsappMessageId]
          );

          const currentMessage = currentResult.rows[0] as
            | {
                delivery_status: string | null;
                read_at: string | null;
                delivered_at: string | null;
              }
            | undefined;

          const currentDeliveryStatus = (currentMessage?.delivery_status ?? "")
            .toLowerCase()
            .trim();
          const isAlreadyRead =
            currentMessage?.read_at != null || currentDeliveryStatus === "read";
          const incomingNormalized = incomingStatus.toLowerCase().trim();
          let finalStatus = incomingNormalized;

          if (isAlreadyRead) {
            finalStatus = "read";
          } else if (incomingNormalized === "read") {
            finalStatus = "read";
          } else if (incomingNormalized === "delivered") {
            finalStatus = "delivered";
          } else if (incomingNormalized === "sent") {
            finalStatus = currentDeliveryStatus === "failed" ? "failed" : "sent";
          } else if (incomingNormalized === "failed") {
            finalStatus = "failed";
          }

          if (finalStatus === "read") {
            await db.query(
              `
              update messages
              set
                status = 'read',
                delivery_status = 'read',
                delivered_at = coalesce(delivered_at, now()),
                read_at = now()
              where whatsapp_message_id = $1
              `,
              [whatsappMessageId]
            );
          } else if (finalStatus === "delivered") {
            await db.query(
              `
              update messages
              set
                status = 'delivered',
                delivery_status = 'delivered',
                delivered_at = now()
              where whatsapp_message_id = $1
              `,
              [whatsappMessageId]
            );
          } else if (finalStatus === "sent") {
            await db.query(
              `
              update messages
              set
                status = 'sent',
                delivery_status = 'sent'
              where whatsapp_message_id = $1
              `,
              [whatsappMessageId]
            );
          } else if (finalStatus === "failed") {
            await db.query(
              `
              update messages
              set
                status = 'failed',
                delivery_status = 'failed'
              where whatsapp_message_id = $1
              `,
              [whatsappMessageId]
            );
          }

          console.log("WhatsApp message status updated:", {
            whatsappMessageId,
            incomingStatus,
            finalStatus,
          });
        }
      }

      await db.query("update webhook_events set processed = true where id = $1", [
        webhookEventId,
      ]);

      return Response.json({ received: true, status_updated: true });
    }

    if (!messages.length) {
      return Response.json({ received: true, message_saved: false });
    }

    const message = messages[0];
    const waId = contact?.wa_id ?? message.from;
    const profileName = contact?.profile?.name ?? null;
    const rawMessageType = normalizeInboundMessageType(message.type);
    const mediaObject = getInboundMediaObject(message as Record<string, unknown>);
    const mediaId = typeof mediaObject?.id === "string" ? mediaObject.id : null;
    const mediaMimeType =
      typeof mediaObject?.mime_type === "string"
        ? mediaObject.mime_type
        : typeof mediaObject?.mimeType === "string"
          ? mediaObject.mimeType
          : null;
    const mediaFilename = getInboundMediaFilename(message as Record<string, unknown>);
    const caption = getInboundMediaCaption(message as Record<string, unknown>);

    const fallbackContent =
      rawMessageType === "image"
        ? "[image]"
        : rawMessageType === "audio"
          ? "[audio]"
          : rawMessageType === "document"
            ? mediaFilename
              ? `[document] ${mediaFilename}`
              : "[document]"
            : rawMessageType === "video"
              ? "[video]"
              : rawMessageType === "sticker"
                ? "[sticker]"
                : `[${rawMessageType}]`;

    const messageContent =
      rawMessageType === "text"
        ? message.text?.body ?? ""
        : caption?.trim() || fallbackContent;

    console.log("Inbound media detected", {
      type: rawMessageType,
      mediaId,
      mimeType: mediaMimeType,
      filename: mediaFilename,
    });

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

    let savedMediaUrl: string | null = null;
    let savedMediaFilename: string | null = null;
    let savedMediaSize: number | null = null;
    let resolvedMimeType: string | null = mediaMimeType;

    if (mediaId) {
      try {
        const mediaInfo = await getWhatsAppMediaInfo(mediaId);
        resolvedMimeType = mediaInfo.mime_type ?? resolvedMimeType;

        if (mediaInfo.url) {
          const downloadResult = await downloadWhatsAppMedia(mediaInfo.url);
          const savedMedia = await saveMediaBufferToPublic({
            buffer: downloadResult.buffer,
            mimeType: mediaInfo.mime_type ?? downloadResult.mimeType,
            baseName: message.id ?? mediaId,
            fallbackType: rawMessageType,
          });

          savedMediaUrl = savedMedia.mediaUrl;
          savedMediaFilename = mediaFilename ?? savedMedia.savedFileName;
          savedMediaSize = savedMedia.mediaSize;

          console.log("Inbound media local save", {
            mediaUrl: savedMediaUrl,
            mediaSize: savedMediaSize,
          });
        } else {
          console.error("Inbound media info has no download URL:", {
            mediaId,
          });
        }
      } catch (error) {
        console.error("Inbound media download/save failed:", {
          mediaId,
          error,
        });
      }
    }

    const savedMessageResult = await db.query(
      `
      insert into messages
      (
        conversation_id,
        direction,
        message_type,
        content,
        whatsapp_message_id,
        raw_payload,
        media_id,
        media_url,
        media_mime_type,
        media_filename,
        media_size
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      returning id
      `,
      [
        conversationId,
        "inbound",
        rawMessageType,
        messageContent,
        message.id ?? null,
        payload,
        mediaId,
        savedMediaUrl,
        resolvedMimeType,
        savedMediaFilename ?? mediaFilename,
        savedMediaSize,
      ]
    );
    const savedMessageId = savedMessageResult.rows[0]?.id as string | undefined;

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

    void analyzeConversationInternal(conversationId).catch((error) => {
      console.error("Auto analysis failed:", error);
    });

    if (conversationId && savedMessageId) {
      void handleLimitedAutoReply({
        conversationId,
        inboundMessageId: savedMessageId,
      }).catch((error) => {
        console.error("Limited auto-reply failed:", error);
      });

      console.log("Limited auto-reply scheduled:", {
        conversationId,
        inboundMessageId: savedMessageId,
        messageType: rawMessageType,
      });
    }

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

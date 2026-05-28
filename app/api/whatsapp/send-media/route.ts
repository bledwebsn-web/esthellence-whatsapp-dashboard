export const runtime = "nodejs";

import { db } from "@/lib/db";
import {
  getWhatsAppMediaExtension,
  sanitizeWhatsAppFileName,
  sendWhatsAppMediaMessage,
  uploadWhatsAppMedia,
} from "@/lib/whatsapp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_MEDIA_SIZE_BYTES = 16 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/3gpp"]);
const AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/opus",
]);
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  amr: "audio/amr",
  ogg: "audio/ogg",
  opus: "audio/opus",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function getMetaRecipient(conversation: { wa_id: string | null; phone: string | null }) {
  return conversation.wa_id || conversation.phone;
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || value.trim().toLowerCase();
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) return "";
  return fileName.slice(lastDot + 1).trim().toLowerCase();
}

function inferMimeType(file: File) {
  const providedMimeType = normalizeMimeType(file.type || "");
  if (providedMimeType) return providedMimeType;

  const extension = getFileExtension(file.name);
  return MIME_BY_EXTENSION[extension] ?? "";
}

function resolveOutgoingMediaType(file: File) {
  const mimeType = inferMimeType(file);

  if (mimeType.startsWith("image/")) {
    return "image" as const;
  }

  if (mimeType.startsWith("video/")) {
    return "video" as const;
  }

  if (mimeType.startsWith("audio/")) {
    return "audio" as const;
  }

  return "document" as const;
}

function isAllowedDocumentMimeType(mimeType: string, fileName: string) {
  const normalized = mimeType.toLowerCase();
  const lowerFileName = fileName.toLowerCase();

  const allowedExtensions = [
    ".pdf",
    ".txt",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
  ];

  return (
    DOCUMENT_MIME_TYPES.has(normalized) ||
    allowedExtensions.some((extension) => lowerFileName.endsWith(extension))
  );
}

async function saveBufferToPublicUploads(params: {
  buffer: Buffer;
  mimeType: string;
  originalFileName: string;
}) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const relativeDir = path.join("uploads", "whatsapp", year, month);
  const absoluteDir = path.join(process.cwd(), "public", relativeDir);
  const extension = getWhatsAppMediaExtension(params.mimeType, "document");
  const safeBaseName =
    sanitizeWhatsAppFileName(path.parse(params.originalFileName).name || "media");
  const savedFileName = `${safeBaseName}-${randomUUID()}.${extension}`;
  const absolutePath = path.join(absoluteDir, savedFileName);
  const mediaUrl = `/${path.posix.join(
    relativeDir.split(path.sep).join("/"),
    savedFileName
  )}`;

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, params.buffer);

  return {
    mediaUrl,
    savedFileName,
    mediaSize: params.buffer.length,
  };
}

async function readJsonResponse(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) {
    return { data: null as Record<string, unknown> | null, raw, parsed: false };
  }

  try {
    return {
      data: JSON.parse(raw) as Record<string, unknown>,
      raw,
      parsed: true,
    };
  } catch {
    return { data: null as Record<string, unknown> | null, raw, parsed: false };
  }
}

function getResponseErrorMessage(
  result: { data: Record<string, unknown> | null; parsed: boolean },
  fallback: string
) {
  const errorValue = result.data?.error;
  if (typeof errorValue === "string" && errorValue.trim()) {
    return errorValue;
  }

  if (!result.parsed) {
    return "Réponse serveur invalide. Rechargez la page ou vérifiez la route API.";
  }

  return fallback;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const conversationId = String(formData.get("conversation_id") ?? "").trim();
    const file = formData.get("file");
    const caption = String(formData.get("caption") ?? "").trim();

    if (!conversationId || !(file instanceof File) || file.size === 0) {
      return Response.json(
        {
          success: false,
          error: "Failed to send media message",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      return Response.json(
        {
          success: false,
          error: "File too large",
        },
        { status: 413 }
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

    const conversation = conversationResult.rows[0] as
      | { id: string; wa_id: string | null; phone: string | null }
      | undefined;

    if (!conversation) {
      return Response.json(
        {
          success: false,
          error: "Failed to send media message",
        },
        { status: 404 }
      );
    }

    const recipient = getMetaRecipient(conversation);
    if (!recipient) {
      return Response.json(
        {
          success: false,
          error: "Recipient number is missing",
        },
        { status: 400 }
      );
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      throw new Error("WHATSAPP_ACCESS_TOKEN is missing");
    }

    const mimeType = inferMimeType(file);
    if (!mimeType) {
      return Response.json(
        {
          success: false,
          error: "Format non accepté par WhatsApp.",
        },
        { status: 415 }
      );
    }

    const messageType = resolveOutgoingMediaType(file);

    const accepted =
      IMAGE_MIME_TYPES.has(mimeType) ||
      VIDEO_MIME_TYPES.has(mimeType) ||
      AUDIO_MIME_TYPES.has(mimeType) ||
      DOCUMENT_MIME_TYPES.has(mimeType);

    if (!accepted) {
      return Response.json(
        {
          success: false,
          error:
            "Format non accepté par WhatsApp. Formats acceptés : JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MP4, MP3, M4A, AAC, AMR, OGG.",
        },
        { status: 415 }
      );
    }

    if (
      messageType === "document" &&
      !isAllowedDocumentMimeType(mimeType, file.name)
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Format non accepté par WhatsApp. Formats acceptés : JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MP4, MP3, M4A, AAC, AMR, OGG.",
        },
        { status: 415 }
      );
    }

    console.log("Sending media", {
      mimeType,
      messageType,
      filename: file.name,
      size: file.size,
    });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const mediaUpload = await uploadWhatsAppMedia(
      new Blob([fileBuffer], { type: mimeType }),
      mimeType
    );
    const mediaId = mediaUpload?.id ?? null;

    console.log("Media uploaded", { mediaId });

    if (!mediaId) {
      throw new Error("Meta media upload did not return a media id");
    }

    const metaPayload = await sendWhatsAppMediaMessage({
      to: recipient,
      type: messageType,
      mediaId,
      caption: caption || undefined,
      filename: file.name || undefined,
    });

    const whatsappMessageId = metaPayload?.messages?.[0]?.id ?? null;
    const baseName = path.parse(file.name || mediaId).name || mediaId;
    let savedMediaUrl: string | null = null;
    let savedMediaFilename: string | null = null;
    let savedMediaSize: number | null = null;

    try {
      const savedMedia = await saveBufferToPublicUploads({
        buffer: fileBuffer,
        mimeType,
        originalFileName: file.name || `${baseName}.${getWhatsAppMediaExtension(mimeType, messageType)}`,
      });

      savedMediaUrl = savedMedia.mediaUrl;
      savedMediaFilename = file.name || `${baseName}.${getWhatsAppMediaExtension(mimeType, messageType)}`;
      savedMediaSize = savedMedia.mediaSize;
    } catch (saveError) {
      console.error("Failed to save outbound media locally:", saveError);
    }

    const content =
      messageType === "audio"
        ? "[audio]"
        : caption ||
          (messageType === "image"
            ? "[image]"
            : messageType === "video"
              ? "[video]"
              : `[${messageType}]`);

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
        raw_payload,
        media_id,
        media_url,
        media_mime_type,
        media_filename,
        media_size
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
        media_id,
        media_url,
        media_mime_type,
        media_filename,
        media_size,
        created_at
      `,
      [
        conversationId,
        "outbound",
        messageType,
        content,
        whatsappMessageId,
        "sent",
        "sent",
        "human",
        null,
        {
          media_upload: mediaUpload,
          message_send: metaPayload,
        },
        mediaId,
        savedMediaUrl,
        mimeType,
        savedMediaFilename ?? file.name ?? baseName,
        savedMediaSize,
      ]
    );

    await db.query(
      `
      update conversations
      set last_message_at = now(),
          last_message_preview = $1
      where id = $2
      `,
      [content, conversationId]
    );

    return Response.json({
      success: true,
      message: savedMessageResult.rows[0],
      meta: metaPayload,
    });
  } catch (error) {
    const metaError = error instanceof Error ? error.message : String(error);
    console.error("Failed to send media message:", error);

    return Response.json(
      {
        success: false,
        error: metaError || "Failed to send media message",
      },
      { status: 500 }
    );
  }
}

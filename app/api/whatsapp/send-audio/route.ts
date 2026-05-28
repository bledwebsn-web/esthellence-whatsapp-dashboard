export const runtime = "nodejs";

import { db } from "@/lib/db";
import {
  getWhatsAppMediaExtension,
  sanitizeWhatsAppFileName,
  sendWhatsAppMediaMessage,
  uploadWhatsAppMedia,
} from "@/lib/whatsapp";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_AUDIO_SIZE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_AUDIO_BYTES = 32 * 1024 * 1024;

const FINAL_AUDIO_MIME_TYPES = new Set([
  "audio/ogg",
  "audio/opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/amr",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ogg: "audio/ogg",
  opus: "audio/opus",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  amr: "audio/amr",
  webm: "audio/webm",
};

type NormalizedAudio = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  converted: boolean;
  size: number;
};

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || value.trim().toLowerCase();
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) return "";
  return fileName.slice(lastDot + 1).trim().toLowerCase();
}

function inferAudioMimeType(file: File) {
  const providedMimeType = normalizeMimeType(file.type || "");
  if (providedMimeType) return providedMimeType;

  const extension = getFileExtension(file.name);
  return MIME_BY_EXTENSION[extension] ?? "";
}

function isWebmAudio(mimeType: string, fileName: string) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const extension = getFileExtension(fileName);
  return normalizedMimeType.includes("webm") || extension === "webm";
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
  const extension = getWhatsAppMediaExtension(params.mimeType, "audio");
  const safeBaseName =
    sanitizeWhatsAppFileName(path.parse(params.originalFileName).name || "voice-message");
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

async function saveTempFile(buffer: Buffer, fileName: string) {
  const tempDir = path.join(os.tmpdir(), "esthellence-audio");
  await mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${randomUUID()}-${sanitizeWhatsAppFileName(fileName)}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

async function readBuffer(filePath: string) {
  return readFile(filePath);
}

async function normalizeAudioForWhatsApp(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}) : Promise<NormalizedAudio> {
  const originalSize = params.buffer.length;
  const originalMimeType = normalizeMimeType(params.mimeType);
  const originalFileName = params.fileName;

  if (FINAL_AUDIO_MIME_TYPES.has(originalMimeType) && originalSize <= MAX_AUDIO_SIZE_BYTES) {
    return {
      buffer: params.buffer,
      mimeType: originalMimeType,
      fileName: originalFileName,
      converted: false,
      size: originalSize,
    };
  }

  const inputPath = await saveTempFile(params.buffer, originalFileName);
  const tempDir = path.dirname(inputPath);
  const outputPath = path.join(tempDir, `${randomUUID()}-${path.parse(originalFileName).name || "voice-message"}.ogg`);

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      outputPath,
    ]);

    const outputBuffer = await readBuffer(outputPath);

    console.log("Audio normalized for WhatsApp", {
      originalMimeType,
      originalSize,
      finalMimeType: "audio/ogg",
      finalSize: outputBuffer.length,
      converted: true,
    });

    if (outputBuffer.length > MAX_AUDIO_SIZE_BYTES) {
      throw new Error("Audio trop lourd pour WhatsApp après conversion.");
    }

    return {
      buffer: outputBuffer,
      mimeType: "audio/ogg",
      fileName: `${path.parse(originalFileName).name || "voice-message"}.ogg`,
      converted: true,
      size: outputBuffer.length,
    };
  } catch (error) {
    console.error("Audio normalization failed:", error);
    throw new Error("Conversion audio impossible. Vérifiez ffmpeg sur le serveur.");
  } finally {
    await rm(inputPath, { force: true }).catch(() => undefined);
    await rm(outputPath, { force: true }).catch(() => undefined);
  }
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

    if (audio.size > MAX_SOURCE_AUDIO_BYTES) {
      return Response.json(
        {
          success: false,
          error: "Fichier trop lourd ou format non accepté par WhatsApp.",
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
          error: "Failed to send audio message",
        },
        { status: 404 }
      );
    }

    const recipient = conversation.wa_id || conversation.phone;
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

    const inferredMimeType = inferAudioMimeType(audio);
    const isWebm = isWebmAudio(inferredMimeType, audio.name);

    if (!inferredMimeType) {
      return Response.json(
        {
          success: false,
          error:
            "Format audio non accepté par WhatsApp. Utilisez audio/ogg, audio/mp4, audio/mpeg, audio/aac ou audio/amr.",
        },
        { status: 415 }
      );
    }

    if (!isWebm && !FINAL_AUDIO_MIME_TYPES.has(inferredMimeType)) {
      return Response.json(
        {
          success: false,
          error:
            "Format audio non accepté par WhatsApp. Utilisez audio/ogg, audio/mp4, audio/mpeg, audio/aac ou audio/amr.",
        },
        { status: 415 }
      );
    }

    console.log("Sending audio", { mimeType: inferredMimeType, size: audio.size });

    const originalBuffer = Buffer.from(await audio.arrayBuffer());
    const finalAudio = await normalizeAudioForWhatsApp({
      buffer: originalBuffer,
      mimeType: inferredMimeType,
      fileName: audio.name || "voice-message",
    });

    const uploadPayload = await uploadWhatsAppMedia(
      new Blob([finalAudio.buffer as unknown as BlobPart], { type: finalAudio.mimeType }),
      finalAudio.mimeType
    );
    const mediaId = uploadPayload?.id ?? null;

    console.log("Audio uploaded", { mediaId });

    if (!mediaId) {
      throw new Error("Meta audio upload did not return a media id");
    }

    const messagePayload = await sendWhatsAppMediaMessage({
      to: recipient,
      type: "audio",
      mediaId,
    });

    const whatsappMessageId = messagePayload?.messages?.[0]?.id ?? null;
    let savedMediaUrl: string | null = null;
    let savedMediaFilename: string | null = null;
    let savedMediaSize: number | null = null;

    try {
      const savedMedia = await saveBufferToPublicUploads({
        buffer: finalAudio.buffer,
        mimeType: finalAudio.mimeType,
        originalFileName: finalAudio.fileName,
      });

      savedMediaUrl = savedMedia.mediaUrl;
      savedMediaFilename = finalAudio.fileName;
      savedMediaSize = savedMedia.mediaSize;
    } catch (saveError) {
      console.error("Failed to save outbound audio locally:", saveError);
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
        "audio",
        "[audio]",
        whatsappMessageId,
        "sent",
        "sent",
        "human",
        null,
        {
          upload: uploadPayload,
          send: messagePayload,
          normalized_media: {
            mimeType: finalAudio.mimeType,
            size: finalAudio.size,
            converted: finalAudio.converted,
          },
        },
        mediaId,
        savedMediaUrl,
        finalAudio.mimeType,
        savedMediaFilename ?? finalAudio.fileName,
        savedMediaSize ?? finalAudio.size,
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
      meta: messagePayload,
    });
  } catch (error) {
    console.error("Failed to send audio message:", error);

    const message =
      error instanceof Error ? error.message : "Failed to send audio message";

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

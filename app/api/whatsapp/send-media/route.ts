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

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_COMPRESS_TARGET_BYTES = 4.5 * 1024 * 1024;
const MAX_AUDIO_SIZE_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_MEDIA_BYTES = 32 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/3gpp"]);
const AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
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
  webm: "audio/webm",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

type NormalizedMedia = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  converted: boolean;
  size: number;
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

function getFileBaseName(fileName: string) {
  return sanitizeWhatsAppFileName(path.parse(fileName).name || "media");
}

function getMimeTypeFromPath(filePath: string) {
  return inferMimeType({ name: filePath, type: "" } as File);
}

function resolveOutgoingMediaType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image" as const;
  if (mimeType.startsWith("video/")) return "video" as const;
  if (mimeType.startsWith("audio/")) return "audio" as const;
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
  const safeBaseName = getFileBaseName(params.originalFileName);
  const savedFileName = `${safeBaseName}-${randomUUID()}.${extension}`;
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

async function saveTempFile(buffer: Buffer, fileName: string) {
  const tempDir = path.join(os.tmpdir(), "esthellence-media");
  await mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${randomUUID()}-${sanitizeWhatsAppFileName(fileName)}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

async function readBuffer(filePath: string) {
  return readFile(filePath);
}

async function tryRunBinary(
  binNames: string[],
  args: string[]
): Promise<void> {
  let lastError: unknown = null;

  for (const binName of binNames) {
    try {
      await execFileAsync(binName, args);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Unable to execute binaries: ${binNames.join(", ")}`);
}

async function normalizeImageForWhatsApp(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}) : Promise<NormalizedMedia> {
  const originalSize = params.buffer.length;
  const originalMimeType = normalizeMimeType(params.mimeType);
  const originalFileName = params.fileName;

  if (
    originalMimeType === "image/jpeg" &&
    originalSize <= IMAGE_COMPRESS_TARGET_BYTES
  ) {
    return {
      buffer: params.buffer,
      mimeType: "image/jpeg",
      fileName: originalFileName,
      converted: false,
      size: originalSize,
    };
  }

  if (
    originalMimeType === "image/png" &&
    originalSize <= IMAGE_COMPRESS_TARGET_BYTES
  ) {
    return {
      buffer: params.buffer,
      mimeType: "image/png",
      fileName: originalFileName,
      converted: false,
      size: originalSize,
    };
  }

  const inputPath = await saveTempFile(params.buffer, originalFileName);
  const tempDir = path.dirname(inputPath);
  let finalBuffer: Buffer | null = null;
  let finalPath: string | null = null;

  try {
    const qualities = [82, 76, 70, 64];
    const widths = [1600, 1280];

    for (const width of widths) {
      for (const quality of qualities) {
        const outputPath = path.join(
          tempDir,
          `${randomUUID()}-${getFileBaseName(originalFileName)}.jpg`
        );

        const magickArgs = [
          inputPath,
          "-auto-orient",
          "-resize",
          `${width}x${width}>`,
          "-background",
          "white",
          "-alpha",
          "remove",
          "-alpha",
          "off",
          "-quality",
          String(quality),
          outputPath,
        ];

        try {
          await tryRunBinary(["magick", "convert"], magickArgs);
          const outputBuffer = await readBuffer(outputPath);

          console.log("Image normalized for WhatsApp", {
            originalMimeType,
            originalSize,
            finalMimeType: "image/jpeg",
            finalSize: outputBuffer.length,
            converted: true,
          });

          if (outputBuffer.length <= IMAGE_COMPRESS_TARGET_BYTES) {
            finalBuffer = outputBuffer;
            finalPath = outputPath;
            return {
              buffer: finalBuffer,
              mimeType: "image/jpeg",
              fileName: `${getFileBaseName(originalFileName)}.jpg`,
              converted: true,
              size: finalBuffer.length,
            };
          }
        } catch (error) {
          console.error("Image normalization attempt failed:", error);
        } finally {
          await rm(outputPath, { force: true }).catch(() => undefined);
        }
      }
    }

    throw new Error("Image trop lourde pour WhatsApp après compression.");
  } finally {
    await rm(inputPath, { force: true }).catch(() => undefined);
    if (finalPath) {
      await rm(finalPath, { force: true }).catch(() => undefined);
    }
  }
}

async function normalizeVideoForWhatsApp(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}) : Promise<NormalizedMedia> {
  const originalSize = params.buffer.length;
  const originalMimeType = normalizeMimeType(params.mimeType);
  const originalFileName = params.fileName;

  if (
    (originalMimeType === "video/mp4" || originalMimeType === "video/3gpp") &&
    originalSize <= MAX_VIDEO_SIZE_BYTES
  ) {
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

  try {
    const attempts = [
      { width: 1280, crf: 28 },
      { width: 960, crf: 32 },
    ];

    for (const attempt of attempts) {
      const outputPath = path.join(
        tempDir,
        `${randomUUID()}-${getFileBaseName(originalFileName)}.mp4`
      );

      try {
        await execFileAsync("ffmpeg", [
          "-y",
          "-i",
          inputPath,
          "-vf",
          `scale='min(${attempt.width},iw)':-2`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          String(attempt.crf),
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          outputPath,
        ]);

        const outputBuffer = await readBuffer(outputPath);

        console.log("Video normalized for WhatsApp", {
          originalMimeType,
          originalSize,
          finalMimeType: "video/mp4",
          finalSize: outputBuffer.length,
          converted: true,
        });

        if (outputBuffer.length <= MAX_VIDEO_SIZE_BYTES) {
          return {
            buffer: outputBuffer,
            mimeType: "video/mp4",
            fileName: `${getFileBaseName(originalFileName)}.mp4`,
            converted: true,
            size: outputBuffer.length,
          };
        }
      } catch (error) {
        console.error("Video normalization attempt failed:", error);
      } finally {
        await rm(outputPath, { force: true }).catch(() => undefined);
      }
    }

    throw new Error("Vidéo trop lourde pour WhatsApp après compression.");
  } finally {
    await rm(inputPath, { force: true }).catch(() => undefined);
  }
}

async function normalizeAudioForWhatsApp(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}) : Promise<NormalizedMedia> {
  const originalSize = params.buffer.length;
  const originalMimeType = normalizeMimeType(params.mimeType);
  const originalFileName = params.fileName;

  if (
    originalMimeType === "audio/ogg" ||
    originalMimeType === "audio/opus" ||
    originalMimeType === "audio/mp4" ||
    originalMimeType === "audio/mpeg" ||
    originalMimeType === "audio/aac" ||
    originalMimeType === "audio/amr"
  ) {
    if (originalSize <= MAX_AUDIO_SIZE_BYTES) {
      return {
        buffer: params.buffer,
        mimeType: originalMimeType,
        fileName: originalFileName,
        converted: false,
        size: originalSize,
      };
    }
  }

  const inputPath = await saveTempFile(params.buffer, originalFileName);
  const tempDir = path.dirname(inputPath);
  const outputPath = path.join(tempDir, `${randomUUID()}-${getFileBaseName(originalFileName)}.ogg`);

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
      fileName: `${getFileBaseName(originalFileName)}.ogg`,
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

function buildFallbackContent(messageType: string) {
  if (messageType === "image") return "[image]";
  if (messageType === "video") return "[video]";
  if (messageType === "audio") return "[audio]";
  return "[document]";
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

    const originalMimeType = inferMimeType(file);
    const messageType = resolveOutgoingMediaType(originalMimeType);

    if (!originalMimeType) {
      return Response.json(
        {
          success: false,
          error:
            "Format non accepté par WhatsApp. Formats acceptés : JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MP4, MP3, M4A, AAC, AMR, OGG.",
        },
        { status: 415 }
      );
    }

    if (messageType === "document") {
      const acceptedDocument =
        DOCUMENT_MIME_TYPES.has(originalMimeType) ||
        isAllowedDocumentMimeType(originalMimeType, file.name);

      if (!acceptedDocument) {
        return Response.json(
          {
            success: false,
            error:
              "Format non accepté par WhatsApp. Formats acceptés : JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MP4, MP3, M4A, AAC, AMR, OGG.",
          },
          { status: 415 }
        );
      }

      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        return Response.json(
          {
            success: false,
            error: "Document trop lourd pour WhatsApp.",
          },
          { status: 413 }
        );
      }
    }

    if (messageType === "image" && file.size > MAX_SOURCE_MEDIA_BYTES) {
      return Response.json(
        {
          success: false,
          error: "Fichier trop lourd ou format non accepté par WhatsApp.",
        },
        { status: 413 }
      );
    }

    if (messageType === "video" && file.size > MAX_SOURCE_MEDIA_BYTES) {
      return Response.json(
        {
          success: false,
          error: "Fichier trop lourd ou format non accepté par WhatsApp.",
        },
        { status: 413 }
      );
    }

    if (messageType === "audio" && file.size > MAX_SOURCE_MEDIA_BYTES) {
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

    const originalBuffer = Buffer.from(await file.arrayBuffer());
    let finalMedia: NormalizedMedia;

    console.log("Sending media", {
      mimeType: originalMimeType,
      messageType,
      filename: file.name,
      size: file.size,
    });

    if (messageType === "image") {
      finalMedia = await normalizeImageForWhatsApp({
        buffer: originalBuffer,
        mimeType: originalMimeType,
        fileName: file.name || "image",
      });
    } else if (messageType === "video") {
      finalMedia = await normalizeVideoForWhatsApp({
        buffer: originalBuffer,
        mimeType: originalMimeType,
        fileName: file.name || "video",
      });
    } else if (messageType === "audio") {
      finalMedia = await normalizeAudioForWhatsApp({
        buffer: originalBuffer,
        mimeType: originalMimeType,
        fileName: file.name || "audio",
      });
    } else {
      finalMedia = {
        buffer: originalBuffer,
        mimeType: originalMimeType,
        fileName: file.name || "document",
        converted: false,
        size: originalBuffer.length,
      };
    }

    if (messageType === "image" && finalMedia.size > IMAGE_COMPRESS_TARGET_BYTES) {
      return Response.json(
        {
          success: false,
          error: "Image trop lourde pour WhatsApp après compression.",
        },
        { status: 413 }
      );
    }

    if (messageType === "video" && finalMedia.size > MAX_VIDEO_SIZE_BYTES) {
      return Response.json(
        {
          success: false,
          error: "Vidéo trop lourde pour WhatsApp après compression.",
        },
        { status: 413 }
      );
    }

    if (messageType === "audio" && finalMedia.size > MAX_AUDIO_SIZE_BYTES) {
      return Response.json(
        {
          success: false,
          error: "Audio trop lourd pour WhatsApp après conversion.",
        },
        { status: 413 }
      );
    }

    if (messageType === "document" && finalMedia.size > MAX_DOCUMENT_SIZE_BYTES) {
      return Response.json(
        {
          success: false,
          error: "Document trop lourd pour WhatsApp.",
        },
        { status: 413 }
      );
    }

    const mediaUpload = await uploadWhatsAppMedia(
      new Blob([finalMedia.buffer as unknown as BlobPart], { type: finalMedia.mimeType }),
      finalMedia.mimeType
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
      caption: messageType === "audio" ? undefined : caption || undefined,
      filename: messageType === "document" ? file.name || finalMedia.fileName : file.name || undefined,
    });

    const whatsappMessageId = metaPayload?.messages?.[0]?.id ?? null;
    let savedMediaUrl: string | null = null;
    let savedMediaFilename: string | null = null;
    let savedMediaSize: number | null = null;

    try {
      const savedMedia = await saveBufferToPublicUploads({
        buffer: finalMedia.buffer,
        mimeType: finalMedia.mimeType,
        originalFileName: finalMedia.fileName,
      });

      savedMediaUrl = savedMedia.mediaUrl;
      savedMediaFilename = finalMedia.fileName;
      savedMediaSize = savedMedia.mediaSize;
    } catch (saveError) {
      console.error("Failed to save outbound media locally:", saveError);
    }

    console.log("Media normalized for WhatsApp", {
      originalMimeType,
      originalSize: file.size,
      finalMimeType: finalMedia.mimeType,
      finalSize: finalMedia.size,
      converted: finalMedia.converted,
    });

    const content =
      messageType === "audio"
        ? "[audio]"
        : caption || buildFallbackContent(messageType);

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
          normalized_media: {
            mimeType: finalMedia.mimeType,
            size: finalMedia.size,
            converted: finalMedia.converted,
          },
        },
        mediaId,
        savedMediaUrl,
        finalMedia.mimeType,
        savedMediaFilename ?? finalMedia.fileName,
        savedMediaSize ?? finalMedia.size,
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

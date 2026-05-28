type SendWhatsAppTextMessageParams = {
  to: string;
  body: string;
};

type WhatsAppMediaType = "image" | "audio" | "document" | "video";

type SendWhatsAppMediaMessageParams = {
  to: string;
  type: WhatsAppMediaType;
  mediaId: string;
  caption?: string;
  filename?: string;
};

type WhatsAppMediaInfo = {
  id?: string | null;
  url?: string | null;
  mime_type?: string | null;
  sha256?: string | null;
  file_size?: number | null;
};

function getWhatsAppApiBase() {
  const version = process.env.WHATSAPP_API_VERSION ?? "v22.0";
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing");
  }

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is missing");
  }

  return {
    version,
    token,
    phoneNumberId,
  };
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || mimeType.trim().toLowerCase();
}

function normalizeUploadMimeType(mimeType: string) {
  const normalized = normalizeMimeType(mimeType);

  if (normalized === "audio/ogg;codecs=opus") {
    return "audio/ogg";
  }

  if (normalized.startsWith("audio/ogg")) {
    return "audio/ogg";
  }

  return normalized;
}

export function getWhatsAppMediaExtension(mimeType: string, fallbackType?: string) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const normalizedFallbackType = (fallbackType ?? "").toLowerCase();

  if (normalizedMimeType === "image/jpeg") return "jpg";
  if (normalizedMimeType === "image/png") return "png";
  if (normalizedMimeType === "image/webp") return "webp";
  if (normalizedMimeType === "audio/ogg") return "ogg";
  if (normalizedMimeType === "audio/opus") return "opus";
  if (normalizedMimeType === "audio/mpeg") return "mp3";
  if (normalizedMimeType === "audio/mp4") return "m4a";
  if (normalizedMimeType === "audio/aac") return "aac";
  if (normalizedMimeType === "audio/amr") return "amr";
  if (normalizedMimeType === "video/mp4") return "mp4";
  if (normalizedMimeType === "application/pdf") return "pdf";
  if (normalizedMimeType === "text/plain") return "txt";

  if (normalizedFallbackType === "image") return "jpg";
  if (normalizedFallbackType === "audio") return "ogg";
  if (normalizedFallbackType === "video") return "mp4";
  if (normalizedFallbackType === "document") return "pdf";
  if (normalizedFallbackType === "sticker") return "webp";

  return "bin";
}

export function sanitizeWhatsAppFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "media";
}

function readJsonResponse(response: Response) {
  return response.json().catch(() => null);
}

export async function sendWhatsAppTextMessage(
  params: SendWhatsAppTextMessageParams
) {
  const { version, token, phoneNumberId } = getWhatsAppApiBase();

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: {
          body: params.body,
        },
      }),
    }
  );

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Meta WhatsApp API request failed: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

export async function getWhatsAppMediaInfo(
  mediaId: string
): Promise<WhatsAppMediaInfo> {
  const { version, token } = getWhatsAppApiBase();

  const response = await fetch(
    `https://graph.facebook.com/${version}/${mediaId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Meta WhatsApp media info request failed: ${JSON.stringify(payload)}`);
  }

  return payload as WhatsAppMediaInfo;
}

export async function downloadWhatsAppMedia(mediaUrl: string) {
  const { token } = getWhatsAppApiBase();

  const response = await fetch(mediaUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";

  if (!response.ok) {
    const payloadText = buffer.toString("utf8");
    throw new Error(`Meta WhatsApp media download failed: ${payloadText}`);
  }

  return {
    buffer,
    mimeType,
  };
}

export async function uploadWhatsAppMedia(
  file: File | Blob,
  mimeType: string
) {
  const { version, token, phoneNumberId } = getWhatsAppApiBase();
  const uploadFormData = new FormData();
  uploadFormData.append("messaging_product", "whatsapp");
  uploadFormData.append("file", file);
  uploadFormData.append("type", normalizeUploadMimeType(mimeType));

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: uploadFormData,
    }
  );

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Meta WhatsApp media upload failed: ${JSON.stringify(payload)}`);
  }

  const mediaId = payload?.id ?? null;
  if (!mediaId) {
    throw new Error("Meta WhatsApp media upload did not return a media id");
  }

  return payload;
}

export async function sendWhatsAppMediaMessage(
  params: SendWhatsAppMediaMessageParams
) {
  const { version, token, phoneNumberId } = getWhatsAppApiBase();
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: params.to,
    type: params.type,
  };

  if (params.type === "audio") {
    payload.audio = { id: params.mediaId };
  } else if (params.type === "image") {
    payload.image = {
      id: params.mediaId,
      ...(params.caption ? { caption: params.caption } : {}),
    };
  } else if (params.type === "video") {
    payload.video = {
      id: params.mediaId,
      ...(params.caption ? { caption: params.caption } : {}),
    };
  } else {
    payload.document = {
      id: params.mediaId,
      ...(params.filename ? { filename: params.filename } : {}),
      ...(params.caption ? { caption: params.caption } : {}),
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const metaPayload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Meta WhatsApp media message failed: ${JSON.stringify(metaPayload)}`
    );
  }

  return metaPayload;
}

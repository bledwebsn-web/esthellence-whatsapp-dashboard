export const MEDIA_RECEIVED_INTENT = "media_received";
export const MEDIA_REVIEW_SUMMARY =
  "Le lead a envoyé un média. Relecture humaine nécessaire.";

const MEDIA_MESSAGE_TYPES = new Set([
  "image",
  "audio",
  "document",
  "sticker",
  "video",
  "video_note",
  "voice",
  "unknown",
]);

export function isNonTextMediaMessageType(messageType?: string | null) {
  if (!messageType) {
    return false;
  }

  return MEDIA_MESSAGE_TYPES.has(messageType.toLowerCase());
}

export function getIntentDisplayLabel(
  detectedIntent?: string | null,
  messageType?: string | null
) {
  if (detectedIntent === MEDIA_RECEIVED_INTENT) {
    return "Média reçu";
  }

  if (isNonTextMediaMessageType(messageType)) {
    return "Média reçu";
  }

  if (!detectedIntent) {
    return "—";
  }

  return detectedIntent;
}

export function getMediaReviewLabel(messageType?: string | null) {
  return isNonTextMediaMessageType(messageType)
    ? MEDIA_REVIEW_SUMMARY
    : null;
}

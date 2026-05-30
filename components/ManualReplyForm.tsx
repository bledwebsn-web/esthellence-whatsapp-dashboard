"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type ManualReplyFormProps = {
  conversationId: string;
  autoReplyEnabled?: boolean;
};

type ConversationSummaryCardProps = {
  conversationId: string;
  initialSummary: string | null;
  className?: string;
  embedded?: boolean;
  showHeader?: boolean;
};

type JsonResponseResult = {
  data: Record<string, unknown> | null;
  raw: string;
  parsed: boolean;
};

export const WABASSIST_BADGE_SRC = "/wabassist-circle.webp";

const MAX_MEDIA_SIZE_BYTES = 16 * 1024 * 1024;
const MAX_TEXTAREA_HEIGHT = 96;
const ACCEPTED_FILE_INPUT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/3gpp",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/opus",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".pdf",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".mp4",
  ".3gp",
  ".mp3",
  ".m4a",
  ".aac",
  ".amr",
  ".ogg",
  ".opus",
].join(",");

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
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
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const AUDIO_PREFERRED_RECORDING_TYPES = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
];

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || value.trim().toLowerCase();
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) return "";
  return fileName.slice(lastDot + 1).trim().toLowerCase();
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 o";
  }

  if (bytes < 1024) {
    return `${bytes} o`;
  }

  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function inferMimeTypeFromFile(file: File) {
  const providedMimeType = normalizeMimeType(file.type || "");
  if (providedMimeType) {
    return providedMimeType;
  }

  const extension = getFileExtension(file.name);
  return MIME_BY_EXTENSION[extension] ?? "";
}

function isAcceptedFrontendFile(file: File) {
  const mimeType = inferMimeTypeFromFile(file);
  const extension = getFileExtension(file.name);

  if (IMAGE_MIME_TYPES.has(mimeType)) return true;
  if (VIDEO_MIME_TYPES.has(mimeType)) return true;
  if (AUDIO_MIME_TYPES.has(mimeType)) return true;
  if (DOCUMENT_MIME_TYPES.has(mimeType)) return true;

  return Boolean(MIME_BY_EXTENSION[extension]);
}

function getFileKind(file: File) {
  const mimeType = inferMimeTypeFromFile(file);

  if (IMAGE_MIME_TYPES.has(mimeType)) return "image";
  if (VIDEO_MIME_TYPES.has(mimeType)) return "video";
  if (AUDIO_MIME_TYPES.has(mimeType)) return "audio";
  return "document";
}

function getExtensionBadge(file: File) {
  const extension = getFileExtension(file.name);
  return extension ? extension.toUpperCase() : "FICHIER";
}

function supportsMimeType(mimeType: string) {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(mimeType)
  );
}

function pickRecorderMimeType() {
  return (
    AUDIO_PREFERRED_RECORDING_TYPES.find((mimeType) => supportsMimeType(mimeType)) ??
    null
  );
}

async function readJsonResponse(response: Response): Promise<JsonResponseResult> {
  const raw = await response.text();
  if (!raw.trim()) {
    return { data: null, raw, parsed: false };
  }

  try {
    return {
      data: JSON.parse(raw) as Record<string, unknown>,
      raw,
      parsed: true,
    };
  } catch {
    return { data: null, raw, parsed: false };
  }
}

function getResponseErrorMessage(
  result: JsonResponseResult,
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

function normalizeSummaryText(value: unknown) {
  if (typeof value !== "string") {
    return "Résumé indisponible. Relecture humaine recommandée.";
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed === "[object Object]") {
    return "Résumé indisponible. Relecture humaine recommandée.";
  }

  return trimmed;
}

export function ConversationSummaryCard({
  conversationId,
  initialSummary,
  className,
  embedded = false,
  showHeader = true,
}: ConversationSummaryCardProps) {
  const router = useRouter();
  const [summary, setSummary] = useState(normalizeSummaryText(initialSummary));
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(normalizeSummaryText(initialSummary));
  }, [initialSummary]);

  async function handleRegenerateSummary() {
    if (loadingSummary) return;

    setLoadingSummary(true);
    setSummaryError(null);

    try {
      const response = await fetch("/api/ai/summarize-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      const parsed = await readJsonResponse(response);

      if (!response.ok || !parsed.data?.success) {
        throw new Error(
          getResponseErrorMessage(
            parsed,
            "Résumé indisponible. Réessayez ou relisez la conversation."
          )
        );
      }

      const nextSummary = normalizeSummaryText(parsed.data.summary);
      setSummary(nextSummary);
      router.refresh();
    } catch (error) {
      setSummaryError(
        error instanceof Error
          ? error.message
          : "Résumé indisponible. Réessayez ou relisez la conversation."
      );
    } finally {
      setLoadingSummary(false);
    }
  }

  const summaryLines = summary.split(/\r?\n/).filter(Boolean);
  const isLongSummary = summaryLines.length > 5 || summary.length > 420;

  const content = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div
          className={`text-[11px] uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200 ${
            showHeader ? "" : "sr-only"
          }`}
        >
          Résumé IA
        </div>
        <button
          type="button"
          onClick={() => void handleRegenerateSummary()}
          disabled={loadingSummary}
          className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[11px] text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingSummary ? "Génération..." : "Régénérer"}
        </button>
      </div>

      <div className="text-sm leading-6 text-slate-800 dark:text-slate-100">
        {isLongSummary ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.18em] text-[var(--app-muted)] transition hover:text-[var(--app-fg)]">
              Voir le résumé complet
            </summary>
            <div className="mt-3 whitespace-pre-line">{summary}</div>
          </details>
        ) : (
          <div className="whitespace-pre-line">{summary}</div>
        )}
      </div>

      {summaryError ? (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
          {summaryError}
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className={className ?? ""}>{content}</div>;
  }

  return (
    <section
      className={`rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 ${
        className ?? ""
      }`}
    >
      {content}
    </section>
  );
}

export default function ManualReplyForm({
  conversationId,
  autoReplyEnabled: initialAutoReplyEnabled = true,
}: ManualReplyFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const previewObjectUrlRef = useRef<string | null>(null);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(Boolean(initialAutoReplyEnabled));
  const [toggleLoading, setToggleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);

  const hasText = message.trim().length > 0;
  const hasAttachment = Boolean(selectedFile);
  const canSend = hasText || hasAttachment;
  const selectedFileKind = useMemo(
    () => (selectedFile ? getFileKind(selectedFile) : null),
    [selectedFile]
  );
  const selectedFileSizeLabel = useMemo(
    () => (selectedFile ? formatFileSize(selectedFile.size) : ""),
    [selectedFile]
  );
  const selectedFileBadge = useMemo(
    () => (selectedFile ? getExtensionBadge(selectedFile) : ""),
    [selectedFile]
  );
  const placeholder = hasAttachment ? "Ajouter un commentaire..." : "Écrire un message...";

  useEffect(() => {
    setAiEnabled(Boolean(initialAutoReplyEnabled));
  }, [initialAutoReplyEnabled]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [message, selectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFilePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setSelectedFilePreviewUrl(objectUrl);
    previewObjectUrlRef.current = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
      if (previewObjectUrlRef.current === objectUrl) {
        previewObjectUrlRef.current = null;
      }
    };
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, []);

  async function handleAiSuggestion() {
    if (loading || recording || toggleLoading) return;

    setError(null);

    try {
      const response = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      const parsed = await readJsonResponse(response);

      if (!response.ok || !parsed.data?.success) {
        throw new Error(
          getResponseErrorMessage(parsed, "Impossible de générer une réponse IA.")
        );
      }

      if (typeof parsed.data.reply === "string") {
        setMessage(parsed.data.reply);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch (suggestionError) {
      setError(
        suggestionError instanceof Error
          ? suggestionError.message
          : "Impossible de générer une réponse IA."
      );
    }
  }

  async function handleToggleAutoReply() {
    if (loading || recording || toggleLoading) return;

    const nextValue = !aiEnabled;
    const previousValue = aiEnabled;
    setToggleLoading(true);
    setAiEnabled(nextValue);
    setError(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/auto-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto_reply_enabled: nextValue }),
        }
      );

      const parsed = await readJsonResponse(response);

      if (!response.ok || !parsed.data?.success) {
        throw new Error(
          getResponseErrorMessage(parsed, "Impossible de mettre à jour l’auto-réponse.")
        );
      }

      const normalized =
        typeof parsed.data.auto_reply_enabled === "boolean"
          ? parsed.data.auto_reply_enabled
          : nextValue;

      setAiEnabled(normalized);
      router.refresh();
    } catch (toggleError) {
      setAiEnabled(previousValue);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Impossible de mettre à jour l’auto-réponse."
      );
    } finally {
      setToggleLoading(false);
    }
  }

  async function handleTextSubmit() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading || recording || toggleLoading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: trimmedMessage,
        }),
      });

      const parsed = await readJsonResponse(response);

      if (!response.ok || !parsed.data?.success) {
        throw new Error(
          getResponseErrorMessage(parsed, "Impossible d’envoyer le message WhatsApp.")
        );
      }

      setMessage("");
      router.refresh();
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Impossible d’envoyer le message WhatsApp."
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendMediaFile(file: File) {
    if (loading || recording || toggleLoading) return;

    if (!isAcceptedFrontendFile(file)) {
      setError(
        "Format non accepté par WhatsApp. Formats acceptés : JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MP4, MP3, M4A, AAC, AMR, OGG."
      );
      return;
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      setError("Fichier trop volumineux. Limite MVP : 16 Mo.");
      return;
    }

    setLoading(true);
    setError(null);

    const caption = hasText ? message.trim() : "";
    const fileKind = getFileKind(file);

    try {
      const formData = new FormData();
      formData.append("conversation_id", conversationId);
      formData.append("file", file);

      if (caption && fileKind !== "audio") {
        formData.append("caption", caption);
      }

      const response = await fetch("/api/whatsapp/send-media", {
        method: "POST",
        body: formData,
      });

      const parsed = await readJsonResponse(response);

      if (!response.ok || !parsed.data?.success) {
        throw new Error(
          getResponseErrorMessage(parsed, "Impossible d’envoyer le média.")
        );
      }

      setMessage("");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      router.refresh();
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (mediaError) {
      setError(
        mediaError instanceof Error ? mediaError.message : "Impossible d’envoyer le média."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isAcceptedFrontendFile(file)) {
      setError(
        "Format non accepté par WhatsApp. Formats acceptés : JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MP4, MP3, M4A, AAC, AMR, OGG."
      );
      event.target.value = "";
      return;
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      setError("Fichier trop volumineux. Limite MVP : 16 Mo.");
      event.target.value = "";
      return;
    }

    setError(null);
    setSelectedFile(file);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function startRecording() {
    const selectedMimeType = pickRecorderMimeType();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("La capture audio n’est pas disponible sur ce navigateur.");
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];

      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = mediaChunksRef.current;
        mediaChunksRef.current = [];

        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);

        if (chunks.length === 0) {
          return;
        }

        const blob = new Blob(chunks, {
          type: recorder.mimeType || selectedMimeType || "audio/webm",
        });
        const recordedMimeType = (
          blob.type || recorder.mimeType || selectedMimeType || "audio/webm"
        )
          .toLowerCase()
          .trim();
        const extension = recordedMimeType.includes("ogg")
          ? "ogg"
          : recordedMimeType.includes("mp4")
            ? "m4a"
            : recordedMimeType.includes("mpeg")
              ? "mp3"
              : recordedMimeType.includes("aac")
                ? "aac"
                : recordedMimeType.includes("amr")
                  ? "amr"
                  : recordedMimeType.includes("opus")
                    ? "opus"
                    : "webm";
        const file = new File([blob], `voice-message.${extension}`, {
          type: recordedMimeType || "audio/webm",
        });

        setLoading(true);
        setError(null);

        try {
          const formData = new FormData();
          formData.append("conversation_id", conversationId);
          formData.append("audio", file);

          const response = await fetch("/api/whatsapp/send-audio", {
            method: "POST",
            body: formData,
          });

          const parsed = await readJsonResponse(response);

          if (!response.ok || !parsed.data?.success) {
            throw new Error(
              getResponseErrorMessage(
                parsed,
                "Impossible d’envoyer le message vocal."
              )
            );
          }

          router.refresh();
        } catch (audioError) {
          setError(
            audioError instanceof Error
              ? audioError.message
              : "Impossible d’envoyer le message vocal."
          );
        } finally {
          setLoading(false);
          requestAnimationFrame(() => textareaRef.current?.focus());
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (recordingError) {
      setError(
        recordingError instanceof Error
          ? recordingError.message
          : "Impossible d’accéder au micro."
      );
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setRecording(false);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        void (selectedFile ? sendMediaFile(selectedFile) : handleTextSubmit());
      }
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      void handleAiSuggestion();
    }
  }

  const selectedFileDisplay = selectedFile ? (
    <div className="mb-2 rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-2 shadow-sm shadow-slate-950/5 transition-colors duration-200 focus-within:border-cyan-400/30 focus-within:shadow-slate-950/10 dark:bg-[var(--app-panel)] dark:shadow-black/10">
      <div className="flex items-start gap-2.5">
        {selectedFileKind === "image" && selectedFilePreviewUrl ? (
          <a
            href={selectedFilePreviewUrl}
            target="_blank"
            rel="noreferrer"
            className="block shrink-0 overflow-hidden rounded-[18px] border border-[var(--app-border)]"
          >
            <img
              src={selectedFilePreviewUrl}
              alt={selectedFile.name}
              className="h-[52px] w-[52px] object-cover"
            />
          </a>
        ) : selectedFileKind === "video" && selectedFilePreviewUrl ? (
          <video
            src={selectedFilePreviewUrl}
            controls
            className="h-14 w-24 shrink-0 rounded-[18px] border border-[var(--app-border)] object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[11px] font-semibold text-[var(--app-fg)]">
            {selectedFileBadge}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[var(--app-fg)] sm:text-sm">
                {selectedFile.name}
              </div>
              <div className="text-[11px] text-[var(--app-muted)]">
                {selectedFileSizeLabel}
                {selectedFile.type ? ` · ${selectedFile.type}` : ""}
              </div>
            </div>

            <button
              type="button"
              aria-label="Retirer le fichier"
              onClick={clearSelectedFile}
              disabled={loading || recording || toggleLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-fg)] transition hover:bg-[var(--app-panel)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {selectedFileKind === "audio" && selectedFilePreviewUrl ? (
            <audio controls src={selectedFilePreviewUrl} className="mt-2 w-full" />
          ) : null}

          {selectedFileKind === "document" ? (
            <div className="mt-2 inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
              {selectedFileBadge}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`mx-auto w-full px-3 transition-all duration-300 sm:px-0 ${
        hasText || hasAttachment ? "sm:max-w-[920px]" : "sm:max-w-[680px]"
      }`}
    >
      <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-2 py-1.5 shadow-sm shadow-slate-950/5 backdrop-blur-md transition-colors duration-200 dark:bg-[var(--app-panel)] dark:shadow-black/10">
        {selectedFileDisplay}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_FILE_INPUT}
            onChange={handleFileSelect}
          />

          <button
            type="button"
            aria-label="Ajouter un fichier"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-fg)] transition hover:bg-[var(--app-panel)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || recording || toggleLoading}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4.5 w-4.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={placeholder}
              disabled={loading || recording || toggleLoading}
              className="min-h-[42px] max-h-[120px] w-full resize-none border-0 bg-transparent px-1 py-[10px] text-[15px] leading-6 text-[var(--app-fg)] placeholder:text-[var(--app-muted)] outline-none transition placeholder:opacity-100"
            />
          </div>

          {canSend ? (
            <button
              type="button"
              aria-label="Envoyer le message"
              onClick={() =>
                void (selectedFile ? sendMediaFile(selectedFile) : handleTextSubmit())
              }
              disabled={loading || !canSend}
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-fg)] transition hover:bg-[var(--app-panel)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5" />
                <path d="m6 11 6-6 6 6" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={recording ? "Arrêter l’enregistrement" : "Enregistrer un message vocal"}
                onClick={() => {
                  if (loading) return;
                  if (recording) {
                    stopRecording();
                  } else {
                    void startRecording();
                  }
                }}
                disabled={loading}
                className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  recording
                    ? "border-rose-400/35 bg-rose-400/10 text-rose-200 animate-pulse"
                    : "border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-fg)] hover:bg-[var(--app-panel)]"
                }`}
              >
                {recording ? (
                  <span className="h-3.5 w-3.5 rounded-sm bg-rose-300" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-5 w-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
                    <path d="M19 11a7 7 0 0 1-14 0" />
                    <path d="M12 18v3" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                aria-label="Basculer WABAssist"
                aria-pressed={aiEnabled}
                onClick={() => void handleToggleAutoReply()}
                disabled={toggleLoading}
                className={`inline-flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border p-0 transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  aiEnabled
                    ? "border-emerald-400/40 bg-[var(--app-panel-soft)]"
                    : "border-[var(--app-border)] bg-[var(--app-panel-soft)]"
                }`}
              >
                <img
                  src={WABASSIST_BADGE_SRC}
                  alt="WABAssist"
                  className={`h-full w-full rounded-full object-cover ${
                    aiEnabled ? "opacity-100" : "opacity-60 grayscale"
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {error ? (
          <div className="mt-2 px-1 text-[11px] text-rose-200">{error}</div>
        ) : null}
      </div>
    </div>
  );
}

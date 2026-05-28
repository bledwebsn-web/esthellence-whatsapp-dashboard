"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ManualReplyFormProps = {
  conversationId: string;
  autoReplyEnabled?: boolean;
};

export const WABASSIST_BADGE_SRC = "/wabassist-circle.webp";

function supportsMimeType(mimeType: string) {
  return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType);
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

type ConversationSummaryCardProps = {
  conversationId: string;
  initialSummary: string | null;
  className?: string;
  embedded?: boolean;
  showHeader?: boolean;
};

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

      const data: { success?: boolean; summary?: unknown; error?: string } =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Résumé indisponible. Réessayez ou relisez la conversation."
        );
      }

      const nextSummary = normalizeSummaryText(data.summary);
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
          className={`text-[11px] uppercase tracking-[0.18em] text-cyan-200/70 ${
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

      <div className="text-sm leading-6 text-[var(--app-fg)]">
        {isLongSummary ? (
          <details open className="group">
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
      className={`rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 ${className ?? ""}`}
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

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(Boolean(initialAutoReplyEnabled));
  const [toggleLoading, setToggleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const hasText = message.trim().length > 0;

  useEffect(() => {
    setAiEnabled(Boolean(initialAutoReplyEnabled));
  }, [initialAutoReplyEnabled]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 88)}px`;
  }, [message]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function handleAiSuggestion() {
    if (loading) return;

    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate AI suggestion");
      }

      if (typeof data.reply === "string") {
        setMessage(data.reply);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch (suggestionError) {
      setError(
        suggestionError instanceof Error
          ? suggestionError.message
          : "Failed to generate AI suggestion"
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
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/auto-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto_reply_enabled: nextValue }),
        }
      );

      const data: {
        success?: boolean;
        auto_reply_enabled?: boolean;
        error?: string;
      } = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update auto-reply");
      }

      const normalized =
        typeof data.auto_reply_enabled === "boolean"
          ? data.auto_reply_enabled
          : nextValue;

      setAiEnabled(normalized);
      router.refresh();
    } catch (toggleError) {
      setAiEnabled(previousValue);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update auto-reply"
      );
    } finally {
      setToggleLoading(false);
    }
  }

  async function handleSubmit() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: trimmedMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to send WhatsApp message");
      }

      setMessage("");
      setSelectedFileName(null);
      setSuccess("Message envoyé.");
      router.refresh();
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to send WhatsApp message"
      );
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    try {
      setError(null);
      setSuccess(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];

      const mimeType = supportsMimeType("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });

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

        const blob = new Blob(chunks, { type: mimeType });
        const extension = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-message.${extension}`, {
          type: mimeType,
        });

        const formData = new FormData();
        formData.append("conversation_id", conversationId);
        formData.append("audio", file);

        setLoading(true);
        try {
          const response = await fetch("/api/whatsapp/send-audio", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to send audio message");
          }

          setSuccess("Message vocal envoyé.");
          router.refresh();
        } catch (audioError) {
          setError(
            audioError instanceof Error
              ? audioError.message
              : "Failed to send audio message"
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
          : "Microphone access denied"
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (hasText) {
        void handleSubmit();
      }
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      void handleAiSuggestion();
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    console.info("Media attachment staged (upload not wired yet):", file);
  }

  return (
    <div
      className={`mx-auto w-full px-0 transition-all duration-300 sm:px-0 ${
        hasText ? "sm:max-w-[920px]" : "sm:max-w-[680px]"
      }`}
    >
      <div className="rounded-[28px] border border-white/10 bg-white/[0.07] px-2.5 py-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        {selectedFileName ? (
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-[var(--app-muted)]">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              <span className="max-w-[220px] truncate">{selectedFileName}</span>
            </span>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,application/pdf"
            onChange={handleFileSelect}
          />

          <button
            type="button"
            aria-label="Ajouter un fichier"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--app-fg)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || recording}
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
              placeholder="Écrire un message..."
              disabled={loading || recording}
              className="min-h-[40px] max-h-[88px] w-full resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 text-[var(--app-fg)] placeholder:text-[var(--app-muted)] outline-none"
            />
          </div>

          {hasText ? (
            <button
              type="button"
              aria-label="Envoyer le message"
              onClick={() => void handleSubmit()}
              disabled={loading || !hasText}
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--app-fg)] shadow-[0_10px_28px_rgba(0,0,0,0.18)] transition hover:scale-105 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
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
                    : "border-white/10 bg-white/5 text-[var(--app-fg)] hover:bg-white/10"
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
                    ? "border-emerald-400/40 bg-white/5 shadow-[0_0_0_1px_rgba(74,222,128,0.08)]"
                    : "border-white/10 bg-white/5"
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

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ManualReplyFormProps = {
  conversationId: string;
};

const AI_STORAGE_KEY = "wabassist-enabled";
export const WABASSIST_BADGE_SRC = "/wabassist-circle.webp";

function getStoredAiEnabled() {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(AI_STORAGE_KEY);
  return stored !== "false";
}

function supportsMimeType(mimeType: string) {
  return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType);
}

export default function ManualReplyForm({
  conversationId,
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
  const [aiEnabled, setAiEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  useEffect(() => {
    setAiEnabled(getStoredAiEnabled());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AI_STORAGE_KEY, String(aiEnabled));
    } catch {
      // ignore storage issues
    }
  }, [aiEnabled]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  }, [message]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const hasText = message.trim().length > 0;

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

      const recorder = new MediaRecorder(stream, {
        mimeType,
      });

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

  return (
    <div className="w-full px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="rounded-[30px] border border-white/10 bg-[color:var(--app-composer)]/92 p-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
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
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--app-fg)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || recording}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
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
                className="min-h-[44px] max-h-[96px] w-full resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 text-[var(--app-fg)] placeholder:text-[var(--app-muted)] outline-none"
              />
            </div>

            {hasText ? (
              <button
                type="button"
                aria-label="Envoyer le message"
                onClick={() => void handleSubmit()}
                disabled={loading || !hasText}
                className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--app-fg)] shadow-[0_10px_30px_rgba(0,0,0,0.2)] transition hover:scale-105 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
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
                      ? "border-rose-400/40 bg-rose-400/15 text-rose-200 animate-pulse"
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
                  onClick={() => setAiEnabled((current) => !current)}
                  className={`inline-flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border p-0 transition ${
                    aiEnabled
                      ? "border-emerald-400/40 bg-white/5"
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

          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-[var(--app-muted)]">
            <div className="min-h-[16px]">
              {loading
                ? recording
                  ? "Enregistrement…"
                  : "Envoi…"
                : success ?? error ?? ""}
            </div>
            {recording ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[11px] text-rose-200">
                <span className="h-2 w-2 rounded-full bg-rose-300 animate-pulse" />
                Enregistrement…
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

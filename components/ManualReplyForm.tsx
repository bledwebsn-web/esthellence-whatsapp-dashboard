"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ManualReplyFormProps = {
  conversationId: string;
};

const AI_STORAGE_KEY = "wabassist-enabled";
export const WABASSIST_BADGE_SRC = "/wabassist-circle.webp";

function getStoredAiEnabled() {
  if (typeof window === "undefined") return true;

  const stored = window.localStorage.getItem(AI_STORAGE_KEY);
  if (stored === "false") return false;
  return true;
}

export default function ManualReplyForm({
  conversationId,
}: ManualReplyFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
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
      // ignore
    }
  }, [aiEnabled]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [message]);

  const hasText = message.trim().length > 0;

  const aiLabel = useMemo(() => {
    return aiEnabled ? "WABAssist actif" : "WABAssist inactif";
  }, [aiEnabled]);

  function handleMicClick() {
    console.info("Voice input not implemented yet.");
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    console.info("Media attachment staged (upload not wired yet):", file);
  }

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
      textareaRef.current?.focus();
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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-[980px] px-3 pb-[calc(0.8rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
        <div className="pointer-events-auto rounded-[30px] border border-white/10 bg-[color:var(--app-composer)]/92 p-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf"
            onChange={handleFileSelect}
          />

          {selectedFileName ? (
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-[var(--app-muted)]">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span className="max-w-[220px] truncate">{selectedFileName}</span>
              </span>
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label="Ajouter un fichier"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--app-fg)] transition hover:bg-white/10"
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
                disabled={loading}
                className="w-full resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 text-[var(--app-fg)] placeholder:text-[var(--app-muted)] outline-none min-h-[48px] max-h-[140px]"
              />
            </div>

            {hasText ? (
              <button
                type="button"
                aria-label="Envoyer le message"
                onClick={() => void handleSubmit()}
                disabled={loading || !hasText}
                className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-white/10 bg-white/10 text-[var(--app-fg)] shadow-[0_10px_30px_rgba(0,0,0,0.2)] transition hover:scale-105 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
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
                  aria-label="Enregistrer un message vocal"
                  onClick={handleMicClick}
                  className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--app-fg)] transition hover:bg-white/10"
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
                    <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
                    <path d="M19 11a7 7 0 0 1-14 0" />
                    <path d="M12 18v3" />
                  </svg>
                </button>

                <button
                  type="button"
                  aria-label="Basculer WABAssist"
                  aria-pressed={aiEnabled}
                  onClick={() => setAiEnabled((current) => !current)}
                  className={`inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 text-xs font-medium transition ${
                    aiEnabled
                      ? "border-emerald-400/25 bg-emerald-400/15 text-emerald-100 shadow-[0_0_0_1px_rgba(34,197,94,0.12),0_0_20px_rgba(34,197,94,0.16)]"
                      : "border-white/10 bg-white/5 text-[var(--app-muted)]"
                  }`}
                >
                  <span className="relative inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/20">
                    <img
                      src={WABASSIST_BADGE_SRC}
                      alt=""
                      aria-hidden="true"
                      className={`h-full w-full object-cover transition ${
                        aiEnabled ? "opacity-100" : "opacity-55 grayscale"
                      }`}
                    />
                    {aiEnabled ? (
                      <span className="absolute inset-0 rounded-full shadow-[0_0_18px_rgba(34,197,94,0.35)]" />
                    ) : null}
                  </span>
                  <span className="hidden sm:inline">
                    {aiEnabled ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-[var(--app-muted)]">
            <div className="min-h-[16px]">
              {loading ? "Envoi…" : success ?? error ?? ""}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  aiEnabled
                    ? "bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]"
                    : "bg-slate-500"
                }`}
              />
              <span>{aiLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

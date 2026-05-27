"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ManualReplyFormProps = {
  conversationId: string;
};

const AI_STORAGE_KEY = "wabassist_composer_ai_enabled";

function getStoredAiEnabled() {
  if (typeof window === "undefined") {
    return true;
  }

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
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
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
      // ignore storage failures
    }
  }, [aiEnabled]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [message]);

  const isMessageEmpty = message.trim().length === 0;

  const aiButtonLabel = useMemo(() => {
    return aiEnabled ? "WABAssist ON" : "WABAssist OFF";
  }, [aiEnabled]);

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isMessageEmpty) {
        void handleSubmit();
      }
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      void handleAiSuggestion();
    }
  }

  async function handleSubmit() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/whatsapp/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  async function handleAiSuggestion() {
    if (loading) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: conversationId,
        }),
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

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    console.info("Media attachment staged (upload not wired yet):", file);
  }

  function handleMicClick() {
    console.info("Voice input not implemented yet.");
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-[980px] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
        <div className="pointer-events-auto rounded-[28px] border border-[color:var(--app-border)] bg-[var(--app-composer)]/95 p-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
          {selectedFileName ? (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1 text-[11px] text-[var(--app-muted)]">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              <span className="max-w-[200px] truncate">{selectedFileName}</span>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
            className="flex items-end gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf"
              onChange={handleFileSelect}
            />

            <button
              type="button"
              aria-label="Ajouter un fichier"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
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

            <div className="flex min-w-0 flex-1 items-end rounded-[24px] border border-[color:var(--app-input-border)] bg-[var(--app-input)] px-3 py-2.5 shadow-inner shadow-black/10 focus-within:border-cyan-400/40 focus-within:ring-2 focus-within:ring-cyan-400/15">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                rows={1}
                className="max-h-[140px] min-h-[48px] w-full resize-none border-0 bg-transparent px-0 py-0 text-sm leading-6 text-[var(--app-fg)] placeholder:text-[var(--app-muted)] outline-none"
                placeholder="Écrire un message..."
                disabled={loading}
              />
            </div>

            {isMessageEmpty ? (
              <>
                <button
                  type="button"
                  aria-label="Enregistrer un message vocal"
                  onClick={handleMicClick}
                  className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
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
                  aria-label={aiButtonLabel}
                  aria-pressed={aiEnabled}
                  onClick={() => {
                    setAiEnabled((current) => !current);
                  }}
                  className={`inline-flex h-10 flex-none items-center gap-2 rounded-full border px-3 text-xs font-medium transition ${
                    aiEnabled
                      ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_0_24px_rgba(34,211,238,0.12)]"
                      : "border-[color:var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-muted)]"
                  }`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold">
                    AI
                  </span>
                  <span className="hidden sm:inline">{aiEnabled ? "ON" : "OFF"}</span>
                </button>
              </>
            ) : (
              <button
                type="submit"
                aria-label="Envoyer le message"
                disabled={loading || !message.trim()}
                className="relative inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-fg)] shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition hover:scale-105 hover:bg-[var(--app-panel-strong)] disabled:cursor-not-allowed disabled:opacity-50"
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
            )}
          </form>

          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-[var(--app-muted)]">
            <div className="min-h-[16px]">
              {loading ? "Envoi…" : success ?? error ?? ""}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  aiEnabled ? "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.75)]" : "bg-slate-500"
                }`}
              />
              <span>{aiEnabled ? "WABAssist actif" : "WABAssist inactif"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

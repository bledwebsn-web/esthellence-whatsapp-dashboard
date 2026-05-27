"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ManualReplyFormProps = {
  conversationId: string;
};

export default function ManualReplyForm({
  conversationId,
}: ManualReplyFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [suggestionInfo, setSuggestionInfo] = useState<{
    confidence: string;
    needs_human: boolean;
    reason: string;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
    if (suggesting) {
      return;
    }

    setSuggesting(true);
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

      setSuggestionInfo({
        confidence: String(data.confidence ?? "low"),
        needs_human: Boolean(data.needs_human),
        reason: String(data.reason ?? ""),
      });
    } catch (suggestionError) {
      setError(
        suggestionError instanceof Error
          ? suggestionError.message
          : "Failed to generate AI suggestion"
      );
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto w-full max-w-[980px] rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-composer)] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.16)] backdrop-blur-md sm:rounded-3xl sm:p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-[var(--app-fg)]">
              Réponse manuelle
            </label>
            <div className="flex items-center gap-2 text-xs">
              {success ? <p className="text-emerald-400">{success}</p> : null}
              {error ? <p className="text-rose-400">{error}</p> : null}
            </div>
          </div>

          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="min-h-[48px] max-h-[96px] w-full resize-y rounded-2xl border border-[color:var(--app-input-border)] bg-[var(--app-input)] px-4 py-3 text-sm text-[var(--app-fg)] placeholder:text-[var(--app-muted)] outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20 sm:min-h-[56px] sm:max-h-[140px]"
            placeholder="Écrire une réponse…"
            disabled={loading || suggesting}
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleAiSuggestion}
              disabled={suggesting || loading}
              className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggesting ? "WABAssist écrit…" : "Réponse IA"}
            </button>
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="inline-flex items-center rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Envoi…" : "Envoyer"}
            </button>
          </div>

          {suggestionInfo ? (
            <div className="rounded-2xl border border-[color:var(--app-border)] bg-black/20 px-3 py-2 text-xs leading-5 text-[var(--app-muted)]">
              <div>
                Confiance :{" "}
                <span className="text-[var(--app-fg)]">{suggestionInfo.confidence}</span>
              </div>
              <div>
                Besoin humain :{" "}
                <span className="text-[var(--app-fg)]">
                  {suggestionInfo.needs_human ? "Oui" : "Non"}
                </span>
              </div>
              <div>
                Raison :{" "}
                <span className="text-[var(--app-fg)]">{suggestionInfo.reason}</span>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

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
    <form
      onSubmit={handleSubmit}
      className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4"
    >
      <label className="mb-3 block text-sm font-medium text-slate-200">
        Réponse manuelle
      </label>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        className="min-h-28 w-full resize-none rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
        placeholder="Écrire une réponse..."
        disabled={loading || suggesting}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleAiSuggestion}
          disabled={suggesting || loading}
          className="inline-flex items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {suggesting ? "Génération..." : "Réponse IA"}
        </button>
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="inline-flex items-center rounded-lg bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Envoi..." : "Envoyer"}
        </button>

        {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </div>

      {suggestionInfo ? (
        <div className="mt-4 space-y-1 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          <p>
            Confiance: <span className="text-white">{suggestionInfo.confidence}</span>
          </p>
          <p>
            Besoin humain:{" "}
            <span className="text-white">
              {suggestionInfo.needs_human ? "Oui" : "Non"}
            </span>
          </p>
          <p>
            Raison: <span className="text-slate-200">{suggestionInfo.reason}</span>
          </p>
        </div>
      ) : null}
    </form>
  );
}

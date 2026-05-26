"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AiSummaryBoxProps = {
  conversationId: string;
  initialSummary: string | null;
};

export default function AiSummaryBox({
  conversationId,
  initialSummary,
}: AiSummaryBoxProps) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/summarize-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: conversationId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to summarize conversation");
      }

      setSummary(typeof data.summary === "string" ? data.summary : summary);
      router.refresh();
    } catch (summaryError) {
      setError(
        summaryError instanceof Error
          ? summaryError.message
          : "Failed to summarize conversation"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Resume IA
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            {summary ?? "Aucun résumé pour le moment"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Génération..." : "Générer résumé IA"}
        </button>
      </div>

      <div className="mt-3 min-h-5">
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    </div>
  );
}

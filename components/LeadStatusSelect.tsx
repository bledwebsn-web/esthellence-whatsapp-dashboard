"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = [
  "nouveau",
  "en_cours",
  "qualifié",
  "rdv",
  "à_rappeler",
  "perdu",
  "spam",
] as const;

type LeadStatusSelectProps = {
  conversationId: string;
  currentStatus: string;
};

export default function LeadStatusSelect({
  conversationId,
  currentStatus,
}: LeadStatusSelectProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextStatus = event.target.value;

    setStatus(nextStatus);
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update status");
      }

      setStatus(data.status ?? nextStatus);
      setSuccess(true);
      router.refresh();
    } catch (updateError) {
      setStatus(currentStatus);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update status"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <select
        value={status}
        onChange={handleChange}
        disabled={loading}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-medium text-slate-100 outline-none transition focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <div className="min-h-5">
        {success ? (
          <p className="text-xs text-emerald-400">Statut mis à jour</p>
        ) : null}
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    </div>
  );
}

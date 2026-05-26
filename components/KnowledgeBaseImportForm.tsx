"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function KnowledgeBaseImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setImportedCount(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/knowledge-base/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to import knowledge base");
      }

      setFile(null);
      setImportedCount(Number(data.imported ?? 0));
      setSuccess(`Import terminé: ${data.imported ?? 0} lignes importées.`);
      router.refresh();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import knowledge base"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20"
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">
            Import en masse
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Importer un CSV ou TSV
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Colonne attendues: Titre, Catégorie, Question probable du lead,
            Réponse officielle WhatsApp, Mots-clés.
          </p>
        </div>

        <input
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded-2xl border border-dashed border-white/15 bg-slate-950/40 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-950 hover:file:bg-cyan-300"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!file || loading}
            className="inline-flex items-center rounded-lg bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Import..." : "Importer"}
          </button>
          {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {importedCount !== null ? (
            <p className="text-sm text-slate-300">{importedCount} lignes importées.</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

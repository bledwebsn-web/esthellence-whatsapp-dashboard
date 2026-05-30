"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type ProductSource = {
  id: string;
  title: string;
  source_type: string;
};

type SalesProfile = {
  id: string;
  name: string;
  product_type: string;
};

type DraftItem = {
  title: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  detected_intent: string;
  sales_profile: string;
  confidence: "high" | "medium" | "low";
  needs_review: boolean;
  notes: string;
};

type GenerationRun = {
  id: string;
  source_id: string | null;
  profile_config_id: string | null;
  status: string;
  generated_items: DraftItem[];
  source_title?: string | null;
  profile_name?: string | null;
  error_message?: string | null;
  created_at: string;
};

function parseJsonResponse<T>(raw: string) {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Réponse serveur invalide. Rechargez la page ou vérifiez la route API.");
  }
}

function fieldClassName() {
  return "w-full rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50";
}

function cardClassName() {
  return "rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm shadow-slate-950/5 backdrop-blur-sm transition-all duration-150 hover:-translate-y-[1px] hover:border-[color:var(--app-accent-border)] hover:bg-[var(--app-panel-soft)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:shadow-black/20 dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.30)] sm:p-5";
}

function badgeClass() {
  return "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export default function KnowledgeBaseDraftGenerator() {
  const [sources, setSources] = useState<ProductSource[]>([]);
  const [profiles, setProfiles] = useState<SalesProfile[]>([]);
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchJson(response: Response) {
      const raw = await response.text();
      return raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};
    }

    async function load() {
      try {
        const [sourcesResponse, profilesResponse, runsResponse] = await Promise.all([
          fetch("/api/knowledge-base/product-sources", { cache: "no-store" }),
          fetch("/api/knowledge-base/sales-profiles", { cache: "no-store" }),
          fetch("/api/knowledge-base/generation-runs", { cache: "no-store" }),
        ]);

        const [sourcesData, profilesData, runsData] = await Promise.all([
          fetchJson(sourcesResponse),
          fetchJson(profilesResponse),
          fetchJson(runsResponse),
        ]);

        if (!sourcesResponse.ok) {
          throw new Error((sourcesData.error as string | undefined) ?? "Impossible de charger les sources.");
        }

        if (!profilesResponse.ok) {
          throw new Error((profilesData.error as string | undefined) ?? "Impossible de charger les profils.");
        }

        if (!runsResponse.ok) {
          throw new Error((runsData.error as string | undefined) ?? "Impossible de charger les brouillons.");
        }

        if (!mounted) {
          return;
        }

        const nextSources = Array.isArray(sourcesData.items) ? (sourcesData.items as ProductSource[]) : [];
        const nextProfiles = Array.isArray(profilesData.items) ? (profilesData.items as SalesProfile[]) : [];
        const nextRuns = Array.isArray(runsData.runs) ? (runsData.runs as GenerationRun[]) : [];

        setSources(nextSources);
        setProfiles(nextProfiles);
        setRuns(nextRuns);

        if (!sourceId && nextSources[0]) {
          setSourceId(nextSources[0].id);
        }

        if (!profileId && nextProfiles[0]) {
          setProfileId(nextProfiles[0].id);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Impossible de charger la génération.");
        }
      } finally {
        if (mounted) {
          setInitialLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const latestRun = useMemo(() => runs[0] ?? null, [runs]);
  const generatedItems = latestRun?.generated_items ?? [];

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (!sourceId || !profileId) {
      setError("Sélectionnez une source et un profil commercial.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/knowledge-base/generate-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_id: sourceId,
          profile_config_id: profileId,
          count,
        }),
      });

      const raw = await response.text();
      const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};

      if (!response.ok || !data.run) {
        throw new Error((data.error as string | undefined) ?? "Impossible de générer les brouillons.");
      }

      const nextRun = data.run as GenerationRun;
      setRuns((prev) => [nextRun, ...prev.filter((run) => run.id !== nextRun.id)]);
      setMessage("Brouillons générés.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Impossible de générer les brouillons.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
          Brouillons IA
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--app-fg)] sm:text-2xl">
          Générer des questions/réponses
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          Ces propositions ne sont pas encore dans la base officielle. Elles doivent être validées manuellement. La validation vers la base officielle est prévue au prochain sprint.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="mt-5 grid gap-4 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
              Source produit
            </span>
            <select
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              className={fieldClassName()}
            >
              <option value="">Sélectionner une source</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title} · {source.source_type}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
              Profil commercial
            </span>
            <select
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              className={fieldClassName()}
            >
              <option value="">Sélectionner un profil</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {profile.product_type}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
              Nombre de propositions
            </span>
            <select
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className={fieldClassName()}
            >
              {[5, 10, 15].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || !sourceId || !profileId}
            className="inline-flex items-center rounded-full bg-[var(--app-fg)] px-4 py-2 text-sm font-medium text-[var(--app-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Génération en cours…" : "Générer des brouillons"}
          </button>
          <span className="text-sm text-[var(--app-muted)]">
            Sélectionnez une source et un profil, puis lancez la génération.
          </span>
        </div>
      </form>

      {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--app-fg)]">Brouillons générés</h3>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              Validation vers la base officielle prévue au prochain sprint.
            </p>
          </div>
          <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-sm text-[var(--app-fg)]">
            {generatedItems.length} brouillons
          </span>
        </div>

        {latestRun ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-muted)]">
            Dernier run : {latestRun.source_title ?? "Source inconnue"} · {latestRun.profile_name ?? "Profil inconnu"} · {latestRun.status}
          </div>
        ) : null}

        {initialLoading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
            Chargement des brouillons...
          </div>
        ) : generatedItems.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
            Aucun brouillon généré pour le moment.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {generatedItems.map((item, index) => (
              <article key={`${item.question}-${index}`} className={cardClassName()}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-base font-semibold text-[var(--app-fg)]">
                        {item.title || item.question}
                      </h4>
                      <span className={badgeClass()}>À valider</span>
                      <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
                        {item.category}
                      </span>
                    </div>

                    <div className="mt-3 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)]">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                        Question
                      </div>
                      <div className="mt-2 whitespace-pre-line">{normalizeText(item.question)}</div>
                    </div>

                    <div className="mt-3 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)]">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                        Réponse proposée
                      </div>
                      <div className="mt-2 whitespace-pre-line">{normalizeText(item.answer)}</div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                    <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
                      Profil : {item.sales_profile}
                    </div>
                    <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
                      Confiance : {item.confidence}
                    </div>
                    <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
                      Intention : {item.detected_intent || "unknown"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.keywords.length > 0 ? (
                    item.keywords.map((keyword) => (
                      <span
                        key={`${item.question}-${keyword}`}
                        className="inline-flex rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1 text-xs font-medium text-[var(--app-fg)]"
                      >
                        {keyword}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-[var(--app-muted)]">Aucun mot-clé.</span>
                  )}
                </div>

                {item.notes ? (
                  <div className="mt-4 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-muted)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                      Notes
                    </div>
                    <div className="mt-2 whitespace-pre-line">{normalizeText(item.notes)}</div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-2 text-sm font-medium text-[var(--app-muted)] opacity-60"
                  >
                    Ajouter à la base officielle
                  </button>
                  <span className="text-sm text-[var(--app-muted)]">
                    Validation vers la base officielle prévue au prochain sprint.
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

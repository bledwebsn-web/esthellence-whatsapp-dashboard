"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type ProductSource = {
  id: string;
  title: string;
  source_type: string;
  raw_text: string | null;
  extraction_status?: string | null;
  extraction_error?: string | null;
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
  approved?: boolean;
  knowledge_base_id?: string | null;
  knowledge_base_active?: boolean | null;
  approved_at?: string | null;
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

function badgeClass(approved: boolean) {
  return approved
    ? "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
    : "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
}

function normalizeKeywordsInput(value: string) {
  return value
    .split(/[;,|]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function normalizeDraftItem(raw: unknown): DraftItem {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const question = String(candidate.question ?? "").trim();
  const answer = String(candidate.answer ?? "").trim();
  const title = String(candidate.title ?? "").trim() || question.slice(0, 120) || "Brouillon";
  const category = String(candidate.category ?? "").trim() || "Général";
  const keywords = Array.isArray(candidate.keywords)
    ? candidate.keywords.map((value) => String(value).trim()).filter(Boolean)
    : typeof candidate.keywords === "string"
      ? normalizeKeywordsInput(String(candidate.keywords))
      : [];

  return {
    title,
    category,
    question,
    answer,
    keywords,
    detected_intent: String(candidate.detected_intent ?? "").trim() || "unknown",
    sales_profile: String(candidate.sales_profile ?? "").trim() || "Profil inconnu",
    confidence:
      candidate.confidence === "low"
        ? "low"
        : candidate.confidence === "medium"
          ? "medium"
          : "high",
    needs_review: candidate.needs_review !== false,
    notes: String(candidate.notes ?? "").trim(),
    approved: Boolean(candidate.approved),
    knowledge_base_id:
      typeof candidate.knowledge_base_id === "string" ? candidate.knowledge_base_id : null,
    knowledge_base_active:
      typeof candidate.knowledge_base_active === "boolean" ? candidate.knowledge_base_active : null,
    approved_at: typeof candidate.approved_at === "string" ? candidate.approved_at : null,
  };
}

function normalizeDraftItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeDraftItem);
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getSourceTypeLabel(type: string) {
  if (type === "url") return "Lien";
  if (type === "file") return "Document";
  return "Texte";
}

function countApproved(items: DraftItem[]) {
  return items.filter((item) => Boolean(item.approved || item.knowledge_base_id)).length;
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
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [activateByIndex, setActivateByIndex] = useState<Record<number, boolean>>({});
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);

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
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === sourceId) ?? null,
    [sources, sourceId]
  );
  const sourceHasText = Boolean(normalizeText(String(selectedSource?.raw_text ?? "")));
  const sourceNeedsText = selectedSource?.source_type === "file" && !sourceHasText;
  const approvedCount = useMemo(() => countApproved(draftItems), [draftItems]);

  useEffect(() => {
    const nextItems = normalizeDraftItems(latestRun?.generated_items);
    setDraftItems(nextItems);
    setActivateByIndex(Object.fromEntries(nextItems.map((_, index) => [index, false])) as Record<number, boolean>);
  }, [latestRun?.id]);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (!sourceId || !profileId) {
      setError("Sélectionnez une source et un profil commercial.");
      return;
    }

    if (sourceNeedsText) {
      setError("Cette source ne contient pas encore de texte exploitable.");
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

  function updateDraftItem(index: number, updater: (item: DraftItem) => DraftItem) {
    setDraftItems((prev) => prev.map((item, currentIndex) => (currentIndex === index ? updater(item) : item)));
  }

  function updateDraftField(index: number, field: keyof DraftItem, value: string) {
    updateDraftItem(index, (item) => ({ ...item, [field]: value } as DraftItem));
  }

  function updateDraftKeywords(index: number, value: string) {
    updateDraftItem(index, (item) => ({ ...item, keywords: normalizeKeywordsInput(value) }));
  }

  async function handleSaveDraft(index: number) {
    if (!latestRun || savingIndex !== null || approvingIndex !== null) {
      return;
    }

    const currentItem = draftItems[index];
    if (!currentItem) {
      return;
    }

    setSavingIndex(index);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/knowledge-base/generation-runs/${latestRun.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generated_items: draftItems,
        }),
      });

      const raw = await response.text();
      const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};

      if (!response.ok || !data.run) {
        throw new Error((data.error as string | undefined) ?? "Impossible d’enregistrer le brouillon.");
      }

      const nextRun = data.run as GenerationRun;
      const nextItems = normalizeDraftItems(nextRun.generated_items);

      setRuns((prev) => [nextRun, ...prev.filter((run) => run.id !== nextRun.id)]);
      setDraftItems(nextItems);
      setActivateByIndex(Object.fromEntries(nextItems.map((_, itemIndex) => [itemIndex, false])) as Record<number, boolean>);
      setMessage("Brouillon enregistré.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d’enregistrer le brouillon.");
    } finally {
      setSavingIndex(null);
    }
  }

  async function handleApproveDraft(index: number) {
    if (!latestRun || savingIndex !== null || approvingIndex !== null) {
      return;
    }

    const currentItem = draftItems[index];
    if (!currentItem) {
      return;
    }

    if (!normalizeText(currentItem.question) || !normalizeText(currentItem.answer)) {
      setError("La question et la réponse doivent être renseignées avant validation.");
      return;
    }

    setApprovingIndex(index);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/knowledge-base/approve-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: latestRun.id,
          item_index: index,
          item: {
            title: currentItem.title,
            category: currentItem.category,
            question: currentItem.question,
            answer: currentItem.answer,
            keywords: currentItem.keywords,
            detected_intent: currentItem.detected_intent,
          },
          activate: Boolean(activateByIndex[index]),
        }),
      });

      const raw = await response.text();
      const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};

      if (!response.ok || !data.run || !data.knowledge_base_entry) {
        throw new Error((data.error as string | undefined) ?? "Impossible d’ajouter ce brouillon à la base officielle.");
      }

      const nextRun = data.run as GenerationRun;
      const nextItems = normalizeDraftItems(nextRun.generated_items);
      setRuns((prev) => [nextRun, ...prev.filter((run) => run.id !== nextRun.id)]);
      setDraftItems(nextItems);
      setActivateByIndex(Object.fromEntries(nextItems.map((_, itemIndex) => [itemIndex, false])) as Record<number, boolean>);
      setMessage("Brouillon ajouté à la base officielle.");
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Impossible d’ajouter ce brouillon à la base officielle.");
    } finally {
      setApprovingIndex(null);
    }
  }

  const draftCount = draftItems.length;

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
                  {source.title} | {getSourceTypeLabel(source.source_type)}
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
                  {profile.name} | {profile.product_type}
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
            disabled={loading || !sourceId || !profileId || sourceNeedsText}
            className="inline-flex items-center rounded-full bg-[var(--app-fg)] px-4 py-2 text-sm font-medium text-[var(--app-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Génération en cours..." : "Générer des brouillons"}
          </button>
          <span className="text-sm text-[var(--app-muted)]">
            Sélectionnez une source et un profil, puis lancez la génération.
          </span>
        </div>
        {sourceNeedsText ? (
          <p className="text-sm text-amber-500 dark:text-amber-300">
            Cette source ne contient pas encore de texte exploitable.
          </p>
        ) : null}
      </form>

      {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

      <div className="mt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--app-fg)]">Brouillons générés</h3>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              Vérifiez les propositions avant de les ajouter à la base officielle.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-sm text-[var(--app-fg)]">
              {draftCount} brouillons
            </span>
            <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-sm text-[var(--app-fg)]">
              {approvedCount} validés
            </span>
          </div>
        </div>

        {latestRun ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-muted)]">
            Dernier run | {latestRun.source_title ?? "Source inconnue"} | {latestRun.profile_name ?? "Profil inconnu"} | {latestRun.status}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm leading-6 text-[var(--app-muted)]">
          Ces propositions sont des brouillons. Vérifiez les informations avant de les ajouter à la base officielle.
          La validation humaine reste obligatoire.
        </div>

        {initialLoading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
            Chargement des brouillons...
          </div>
        ) : draftItems.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
            Aucun brouillon généré pour le moment.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {draftItems.map((item, index) => {
              const isApproved = Boolean(item.approved || item.knowledge_base_id);
              const isBusy = loading || savingIndex !== null || approvingIndex !== null;

              return (
                <article key={`${item.question}-${index}`} className={cardClassName()}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={badgeClass(isApproved)}>
                          {isApproved ? "Ajouté à la base officielle" : "À valider"}
                        </span>
                        <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
                          {item.category || "Général"}
                        </span>
                        <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
                          Confiance | {item.confidence}
                        </span>
                      </div>

                      <label className="mt-4 grid gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                          Titre
                        </span>
                        <input
                          value={item.title}
                          onChange={(event) => updateDraftField(index, "title", event.target.value)}
                          disabled={isApproved || isBusy}
                          className={fieldClassName()}
                        />
                      </label>

                      <label className="mt-3 grid gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                          Catégorie
                        </span>
                        <input
                          value={item.category}
                          onChange={(event) => updateDraftField(index, "category", event.target.value)}
                          disabled={isApproved || isBusy}
                          className={fieldClassName()}
                        />
                      </label>

                      <label className="mt-3 grid gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                          Question
                        </span>
                        <textarea
                          value={item.question}
                          onChange={(event) => updateDraftField(index, "question", event.target.value)}
                          disabled={isApproved || isBusy}
                          rows={3}
                          className={`${fieldClassName()} resize-y`}
                        />
                      </label>

                      <label className="mt-3 grid gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                          Réponse proposée
                        </span>
                        <textarea
                          value={item.answer}
                          onChange={(event) => updateDraftField(index, "answer", event.target.value)}
                          disabled={isApproved || isBusy}
                          rows={4}
                          className={`${fieldClassName()} resize-y`}
                        />
                      </label>

                      <label className="mt-3 grid gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                          Mots-clés
                        </span>
                        <input
                          value={item.keywords.join(", ")}
                          onChange={(event) => updateDraftKeywords(index, event.target.value)}
                          disabled={isApproved || isBusy}
                          placeholder="prix, inscription, dates"
                          className={fieldClassName()}
                        />
                      </label>

                      <label className="mt-3 grid gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                          Intention détectée
                        </span>
                        <input
                          value={item.detected_intent}
                          onChange={(event) => updateDraftField(index, "detected_intent", event.target.value)}
                          disabled={isApproved || isBusy}
                          className={fieldClassName()}
                        />
                      </label>

                      {item.notes ? (
                        <div className="mt-4 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-muted)]">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                            Notes
                          </div>
                          <div className="mt-2 whitespace-pre-line">{normalizeText(item.notes)}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                      <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
                        Profil | {item.sales_profile}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
                        Statut | {isApproved ? "Ajouté" : "À valider"}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
                        Confiance | {item.confidence}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
                        Intention | {item.detected_intent || "unknown"}
                      </div>

                      <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-fg)]">
                        <input
                          type="checkbox"
                          checked={Boolean(activateByIndex[index])}
                          onChange={(event) =>
                            setActivateByIndex((prev) => ({
                              ...prev,
                              [index]: event.target.checked,
                            }))
                          }
                          disabled={isApproved || isBusy}
                          className="h-4 w-4 rounded border-[color:var(--app-border)]"
                        />
                        Activer immédiatement
                      </label>

                      <button
                        type="button"
                        onClick={() => void handleSaveDraft(index)}
                        disabled={isApproved || isBusy}
                        className="inline-flex items-center justify-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingIndex === index ? "Enregistrement..." : "Enregistrer le brouillon"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleApproveDraft(index)}
                        disabled={isApproved || isBusy || !normalizeText(item.question) || !normalizeText(item.answer)}
                        className="inline-flex items-center justify-center rounded-full bg-[var(--app-fg)] px-4 py-2 text-sm font-medium text-[var(--app-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {approvingIndex === index ? "Validation..." : "Ajouter à la base officielle"}
                      </button>

                      {isApproved ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                          Ajouté à la base officielle
                        </span>
                      ) : null}

                      <span className="max-w-xs text-sm leading-6 text-[var(--app-muted)]">
                        Une fois ajoutée, cette réponse pourra être utilisée par WABAssist selon son statut actif ou inactif.
                      </span>
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
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

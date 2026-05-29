"use client";

import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import ThemeToggle from "@/components/ThemeToggle";

type KnowledgeBaseItem = {
  id: string;
  title: string | null;
  category: string | null;
  question: string | null;
  answer: string | null;
  keywords: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

type EntryValues = {
  title: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  is_active: boolean;
};

type KnowledgeBaseDashboardProps = {
  initialItems: KnowledgeBaseItem[];
};

type FilterStatus = "all" | "active" | "inactive";
type QualityFilter = "all" | "ready" | "long" | "incomplete";

function stripAccents(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKeywords(value: string) {
  return value
    .split(/[;,|\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function normalizeCategoryKey(value: string | null | undefined) {
  const normalized = stripAccents(String(value ?? "").trim());
  return normalized || "__empty__";
}

function getCategoryLabel(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || "Sans catégorie";
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getSearchText(item: KnowledgeBaseItem) {
  return stripAccents(
    [
      item.title,
      item.category,
      item.question,
      item.answer,
      item.keywords.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getAnswerPreview(answer: string) {
  const normalized = answer.trim();
  if (!normalized) {
    return "Réponse manquante.";
  }

  const lines = normalized.split(/\r?\n/).map((line) => line.trim());
  const visibleLines = lines.slice(0, 4).join("\n").trim();

  if (lines.length > 4 || normalized.length > 320) {
    return `${visibleLines}${visibleLines.endsWith("…") ? "" : "…"}`;
  }

  return normalized;
}

function getQuality(item: KnowledgeBaseItem) {
  const question = normalizeWhitespace(item.question ?? "");
  const answer = normalizeWhitespace(item.answer ?? "");

  if (!question || !answer) {
    return "incomplete";
  }

  if (answer.length > 700) {
    return "long";
  }

  return "ready";
}

function parseJsonResponse<T>(raw: string) {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Réponse serveur invalide. Rechargez la page ou vérifiez la route API.");
  }
}

function filterBadgeClass(active: boolean) {
  return active
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
    : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300";
}

function qualityLabel(item: KnowledgeBaseItem) {
  const quality = getQuality(item);
  if (quality === "long") {
    return "Réponse longue";
  }

  if (quality === "incomplete") {
    if (!normalizeWhitespace(item.question ?? "")) {
      return "Question manquante";
    }

    return "Réponse manquante";
  }

  return "Réponse courte";
}

function EntryField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-end justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
          {label}
        </span>
        {hint ? <span className="text-[11px] text-[var(--app-muted)]">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function EntryEditor({
  value,
  setValue,
  onSubmit,
  onCancel,
  submitLabel,
  loading,
  hint,
}: {
  value: EntryValues;
  setValue: Dispatch<SetStateAction<EntryValues>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  submitLabel: string;
  loading: boolean;
  hint?: string;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {hint ? <p className="text-sm leading-6 text-[var(--app-muted)]">{hint}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <EntryField label="Titre" hint="Obligatoire si la question est vide">
          <input
            value={value.title}
            onChange={(event) => setValue((prev) => ({ ...prev, title: event.target.value }))}
            className="w-full rounded-2xl border border-[color:var(--app-input-border)] bg-[var(--app-input)] px-4 py-3 text-sm text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50"
            placeholder="Tarifs"
          />
        </EntryField>

        <EntryField label="Catégorie">
          <input
            value={value.category}
            onChange={(event) => setValue((prev) => ({ ...prev, category: event.target.value }))}
            className="w-full rounded-2xl border border-[color:var(--app-input-border)] bg-[var(--app-input)] px-4 py-3 text-sm text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50"
            placeholder="pricing"
          />
        </EntryField>
      </div>

      <EntryField label="Question probable du lead">
        <textarea
          value={value.question}
          onChange={(event) => setValue((prev) => ({ ...prev, question: event.target.value }))}
          rows={3}
          className="w-full rounded-2xl border border-[color:var(--app-input-border)] bg-[var(--app-input)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50"
          placeholder="Quels sont les tarifs ?"
        />
      </EntryField>

      <EntryField label="Réponse officielle WhatsApp">
        <textarea
          value={value.answer}
          onChange={(event) => setValue((prev) => ({ ...prev, answer: event.target.value }))}
          rows={7}
          className="w-full rounded-2xl border border-[color:var(--app-input-border)] bg-[var(--app-input)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50"
          placeholder="Réponse officielle prête pour WhatsApp..."
        />
      </EntryField>

      <EntryField label="Mots-clés" hint="Séparés par des virgules">
        <input
          value={value.keywords}
          onChange={(event) => setValue((prev) => ({ ...prev, keywords: event.target.value }))}
          className="w-full rounded-2xl border border-[color:var(--app-input-border)] bg-[var(--app-input)] px-4 py-3 text-sm text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50"
          placeholder="tarif, prix, coût"
        />
      </EntryField>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setValue((prev) => ({ ...prev, is_active: !prev.is_active }))}
          className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-medium transition ${
            value.is_active
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
              : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
          }`}
        >
          {value.is_active ? "Entrée active" : "Entrée inactive"}
        </button>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-2 text-sm font-medium text-[var(--app-muted)] transition hover:bg-[var(--app-panel-strong)]"
            >
              Annuler
            </button>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-full bg-[var(--app-fg)] px-4 py-2 text-sm font-medium text-[var(--app-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Enregistrement..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-[color:var(--app-fg)] bg-[var(--app-fg)] text-[var(--app-bg)]"
          : "border-[color:var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-muted)] hover:bg-[var(--app-panel-strong)]"
      }`}
    >
      {label}
    </button>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-sm text-[var(--app-fg)]">
      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-muted)]">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Badge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel)] px-6 py-16 text-center">
      <div className="text-base font-semibold text-[var(--app-fg)]">
        {hasQuery ? "Aucune entrée ne correspond à votre recherche." : "Aucune entrée pour le moment."}
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
        Ajoutez vos réponses officielles pour que WABAssist reste parfaitement aligné sur le discours Esthellence.
      </p>
    </div>
  );
}

export default function KnowledgeBaseDashboard({
  initialItems,
}: KnowledgeBaseDashboardProps) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importImportedCount, setImportImportedCount] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<EntryValues | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [createDraft, setCreateDraft] = useState<EntryValues>({
    title: "",
    category: "",
    question: "",
    answer: "",
    keywords: "",
    is_active: true,
  });

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();

    for (const item of items) {
      const key = normalizeCategoryKey(item.category);
      const label = getCategoryLabel(item.category);
      if (!categories.has(key)) {
        categories.set(key, label);
      }
    }

    return Array.from(categories.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = stripAccents(query);

    return items
      .filter((item) => {
        const searchText = getSearchText(item);
        const status = item.is_active ? "active" : "inactive";
        const categoryKey = normalizeCategoryKey(item.category);
        const quality = getQuality(item);

        if (statusFilter !== "all" && status !== statusFilter) {
          return false;
        }

        if (categoryFilter !== "all" && categoryKey !== categoryFilter) {
          return false;
        }

        if (qualityFilter !== "all" && quality !== qualityFilter) {
          return false;
        }

        if (normalizedQuery && !searchText.includes(normalizedQuery)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aDate = new Date(a.updated_at ?? a.created_at).getTime();
        const bDate = new Date(b.updated_at ?? b.created_at).getTime();
        return bDate - aDate;
      });
  }, [categoryFilter, items, qualityFilter, query, statusFilter]);

  const metrics = useMemo(() => {
    const total = items.length;
    const active = items.filter((item) => item.is_active).length;
    const ready = items.filter((item) => getQuality(item) === "ready").length;
    const incomplete = items.filter((item) => getQuality(item) === "incomplete").length;

    return { total, active, ready, incomplete };
  }, [items]);

  async function readResponseJson(response: Response) {
    const raw = await response.text();
    const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};
    return data;
  }

  async function reloadItems() {
    const response = await fetch("/api/knowledge-base", { cache: "no-store" });
    const data = await readResponseJson(response);

    if (!response.ok) {
      throw new Error((data.error as string | undefined) ?? "Failed to fetch knowledge base");
    }

    const nextItems = Array.isArray(data.items) ? (data.items as KnowledgeBaseItem[]) : [];
    setItems(nextItems);
  }

  function resetCreateForm() {
    setCreateDraft({
      title: "",
      category: "",
      question: "",
      answer: "",
      keywords: "",
      is_active: true,
    });
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (createLoading) {
      return;
    }

    const resolvedTitle = createDraft.title.trim() || createDraft.question.trim().slice(0, 120).trim();
    const trimmedQuestion = createDraft.question.trim();
    const trimmedAnswer = createDraft.answer.trim();

    if (!resolvedTitle || !trimmedAnswer) {
      setCreateError("Le titre ou la question, ainsi que la réponse, sont obligatoires.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const response = await fetch("/api/knowledge-base", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: createDraft.title.trim(),
          category: createDraft.category.trim(),
          question: trimmedQuestion,
          answer: trimmedAnswer,
          keywords: normalizeKeywords(createDraft.keywords),
        }),
      });

      const data = await readResponseJson(response);

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Failed to create knowledge base item");
      }

      const createdItem = data.item as KnowledgeBaseItem | null;

      if (createdItem) {
        setItems((prev) => [createdItem, ...prev.filter((item) => item.id !== createdItem.id)]);
      } else {
        await reloadItems();
      }

      setCreateSuccess("Entrée ajoutée.");
      resetCreateForm();
      setCreateOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Impossible d’ajouter l’entrée.");
    } finally {
      setCreateLoading(false);
    }
  }

  function startEdit(item: KnowledgeBaseItem) {
    setEditingId(item.id);
    setEditingDraft({
      title: item.title ?? "",
      category: item.category ?? "",
      question: item.question ?? "",
      answer: item.answer ?? "",
      keywords: item.keywords.join(", "),
      is_active: item.is_active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingDraft(null);
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingId || !editingDraft || createLoading) {
      return;
    }

    const resolvedTitle = editingDraft.title.trim() || editingDraft.question.trim().slice(0, 120).trim();
    const trimmedQuestion = editingDraft.question.trim();
    const trimmedAnswer = editingDraft.answer.trim();

    if (!resolvedTitle || !trimmedAnswer) {
      setCreateError("Le titre ou la question, ainsi que la réponse, sont obligatoires.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/knowledge-base", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          title: editingDraft.title.trim(),
          category: editingDraft.category.trim(),
          question: trimmedQuestion,
          answer: trimmedAnswer,
          keywords: normalizeKeywords(editingDraft.keywords),
          is_active: editingDraft.is_active,
        }),
      });

      const data = await readResponseJson(response);

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Failed to update knowledge base item");
      }

      const updatedItem = data.item as KnowledgeBaseItem | null;

      if (updatedItem) {
        setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      } else {
        await reloadItems();
      }

      cancelEdit();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Impossible de mettre à jour l’entrée.");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleToggleActive(item: KnowledgeBaseItem) {
    const nextActive = !item.is_active;
    setItems((prev) =>
      prev.map((entry) => (entry.id === item.id ? { ...entry, is_active: nextActive } : entry))
    );

    try {
      const response = await fetch("/api/knowledge-base", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          is_active: nextActive,
        }),
      });

      const data = await readResponseJson(response);

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Failed to update knowledge base item");
      }

      const updatedItem = data.item as KnowledgeBaseItem | null;

      if (updatedItem) {
        setItems((prev) => prev.map((entry) => (entry.id === updatedItem.id ? updatedItem : entry)));
      }
    } catch (error) {
      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, is_active: item.is_active } : entry))
      );
      setCreateError(error instanceof Error ? error.message : "Impossible de modifier le statut.");
    }
  }

  async function handleImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (importLoading) {
      return;
    }

    const input = importInputRef.current;
    const file = input?.files?.[0] ?? null;

    if (!file) {
      setImportError("Choisissez un fichier CSV ou TSV.");
      return;
    }

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);
    setImportImportedCount(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/knowledge-base/import", {
        method: "POST",
        body: formData,
      });

      const data = await readResponseJson(response);

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Failed to import knowledge base");
      }

      setImportImportedCount(Number(data.imported ?? 0));
      setImportSuccess(`Import terminé : ${Number(data.imported ?? 0)} lignes importées.`);
      setImportOpen(false);
      if (input) {
        input.value = "";
      }
      await reloadItems();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Impossible d’importer le fichier.");
    } finally {
      setImportLoading(false);
    }
  }

  const totalItems = metrics.total;
  const activeItems = metrics.active;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="sticky top-0 z-30 border-b border-[color:var(--app-border)] bg-[var(--app-header)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                Base de connaissances
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Réponses officielles utilisées par WABAssist
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
                Rédigez, testez et activez uniquement les réponses validées par Esthellence pour
                garder l’IA cohérente avec votre discours commercial.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setCreateOpen((value) => !value)}
                className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
              >
                {createOpen ? "Fermer l’ajout" : "Ajouter une entrée"}
              </button>
              <button
                type="button"
                onClick={() => setImportOpen((value) => !value)}
                className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
              >
                {importOpen ? "Fermer l’import" : "Importer CSV/TSV"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatPill label="Actives" value={`${activeItems}/${totalItems || 0}`} />
            <StatPill label="Prêtes WhatsApp" value={metrics.ready} />
            <StatPill
              label="Réponses longues"
              value={items.filter((item) => getQuality(item) === "long").length}
            />
            <StatPill label="Incomplètes" value={metrics.incomplete} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="relative block">
              <span className="sr-only">Rechercher une question, réponse, catégorie…</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une question, réponse, catégorie…"
                className="w-full rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setQualityFilter("all");
                  setCategoryFilter("all");
                }}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 text-sm font-medium text-[var(--app-muted)] transition hover:bg-[var(--app-panel-strong)]"
              >
                Réinitialiser
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <FilterSection
              label="Statut"
              value={statusFilter}
              onChange={(next) => setStatusFilter(next as FilterStatus)}
              options={[
                { value: "all", label: "Toutes" },
                { value: "active", label: "Actives" },
                { value: "inactive", label: "Inactives" },
              ]}
            />

            <FilterSection
              label="Qualité"
              value={qualityFilter}
              onChange={(next) => setQualityFilter(next as QualityFilter)}
              options={[
                { value: "all", label: "Toutes" },
                { value: "ready", label: "Prêtes WhatsApp" },
                { value: "long", label: "Réponses longues" },
                { value: "incomplete", label: "Incomplètes" },
              ]}
            />

            <FilterSection
              label="Catégorie"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "Toutes" },
                ...categoryOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                })),
              ]}
            />
          </div>
        </div>

        {createOpen ? (
          <section className="mt-4 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm backdrop-blur sm:p-5">
            <div className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                Ajouter une entrée
              </p>
              <h2 className="text-lg font-semibold">Nouvelle réponse officielle</h2>
              <p className="text-sm leading-6 text-[var(--app-muted)]">
                Gardez les réponses courtes, claires et prêtes à être envoyées sur WhatsApp.
              </p>
            </div>

            <EntryEditor
              value={createDraft}
              setValue={setCreateDraft}
              onSubmit={handleCreateSubmit}
              submitLabel="Ajouter à la base"
              loading={createLoading}
              hint="Le titre peut être déduit de la question si vous le laissez vide."
            />

            {createSuccess ? <p className="mt-4 text-sm text-emerald-400">{createSuccess}</p> : null}
            {createError ? <p className="mt-4 text-sm text-rose-400">{createError}</p> : null}
          </section>
        ) : null}

        {importOpen ? (
          <section className="mt-4 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm backdrop-blur sm:p-5">
            <div className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                Import en masse
              </p>
              <h2 className="text-lg font-semibold">Importer un CSV ou TSV</h2>
              <p className="text-sm leading-6 text-[var(--app-muted)]">
                Colonnes reconnues : Titre, Catégorie, Question probable du lead, Réponse officielle WhatsApp,
                Mots-clés.
              </p>
            </div>

            <form onSubmit={handleImportSubmit} className="grid gap-4">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                className="block w-full cursor-pointer rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-muted)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--app-fg)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--app-bg)] hover:bg-[var(--app-panel-strong)]"
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={importLoading}
                  className="inline-flex items-center rounded-full bg-[var(--app-fg)] px-4 py-2 text-sm font-medium text-[var(--app-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importLoading ? "Importation..." : "Importer"}
                </button>
                {importImportedCount !== null ? (
                  <p className="text-sm text-[var(--app-muted)]">
                    {importImportedCount} lignes importées.
                  </p>
                ) : null}
              </div>

              {importSuccess ? <p className="text-sm text-emerald-400">{importSuccess}</p> : null}
              {importError ? <p className="text-sm text-rose-400">{importError}</p> : null}
            </form>
          </section>
        ) : null}

        <div className="mt-6 space-y-4">
          {filteredItems.length === 0 ? (
            <EmptyState hasQuery={Boolean(query.trim())} />
          ) : (
            filteredItems.map((item) => {
              const isEditing = editingId === item.id;
              const quality = getQuality(item);
              const answer = item.answer ?? "";
              const answerPreview = getAnswerPreview(answer);
              const isLongAnswer = quality === "long" || normalizeWhitespace(answer).length > 320;
              const title = item.title?.trim() || item.question?.trim() || "Sans titre";
              const categoryLabel = getCategoryLabel(item.category);
              const question = normalizeWhitespace(item.question ?? "");

              return (
                <article
                  key={item.id}
                  className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm transition hover:bg-[var(--app-panel-soft)] sm:p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-semibold text-[var(--app-fg)]">
                          {title}
                        </h3>
                        <Badge
                          label={item.is_active ? "Actif" : "Inactif"}
                          className={filterBadgeClass(item.is_active)}
                        />
                        <Badge
                          label={categoryLabel}
                          className="border-[color:var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-muted)] dark:bg-[var(--app-panel-soft)]"
                        />
                      </div>

                      <div className="mt-1 text-sm text-[var(--app-muted)]">
                        {question || "Question manquante"}
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="rounded-[26px] border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                            Question probable
                          </div>
                          <div className="mt-3 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-inbound-bg)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)]">
                            {question || "Question manquante."}
                          </div>
                        </div>

                        <div className="rounded-[26px] border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                              Réponse officielle WhatsApp
                            </div>
                            {isLongAnswer ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                                Réponse longue
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-inbound-bg)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)] whitespace-pre-line">
                            {answerPreview}
                          </div>

                          {isLongAnswer ? (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-medium text-[var(--app-accent)]">
                                Voir plus
                              </summary>
                              <div className="mt-3 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-inbound-bg)] px-4 py-3 text-sm leading-6 whitespace-pre-line text-[var(--app-fg)]">
                                {answer || "Réponse manquante."}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                          Mots-clés
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.keywords.length > 0 ? (
                            item.keywords.map((keyword) => (
                              <span
                                key={`${item.id}-${keyword}`}
                                className="inline-flex rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1 text-xs font-medium text-[var(--app-fg)]"
                              >
                                {keyword}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-[var(--app-muted)]">Aucun mot-clé.</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge
                          label={qualityLabel(item)}
                          className={
                            quality === "ready"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                              : quality === "long"
                                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
                          }
                        />
                        {!item.is_active ? (
                          <Badge
                            label="Base inactive"
                            className="border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 xl:items-end">
                      <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-fg)]">
                        Créé le {formatDate(item.created_at)}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-fg)]">
                        Mis à jour le {formatDate(item.updated_at)}
                      </div>
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(item)}
                          className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
                        >
                          {item.is_active ? "Désactiver" : "Activer"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isEditing && editingDraft ? (
                    <div className="mt-5 border-t border-[color:var(--app-border)] pt-5">
                      <div className="mb-4 flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                          Édition rapide
                        </p>
                        <p className="text-sm leading-6 text-[var(--app-muted)]">
                          Corrigez cette entrée sans quitter la liste.
                        </p>
                      </div>

                      <EntryEditor
                        value={editingDraft}
                        setValue={(next) => {
                          setEditingDraft((current) => {
                            const base = current ?? editingDraft;
                            if (!base) {
                              return current;
                            }

                            return typeof next === "function" ? next(base) : next;
                          });
                        }}
                        onSubmit={handleSaveEdit}
                        onCancel={cancelEdit}
                        submitLabel="Enregistrer"
                        loading={createLoading}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}

function FilterSection({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
        {label}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((option) => (
          <FilterChip
            key={`${label}-${option.value}`}
            active={value === option.value}
            label={option.label}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

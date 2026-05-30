"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

type ProductSource = {
  id: string;
  title: string;
  source_type: "text" | "url" | "file" | string;
  source_url: string | null;
  file_url: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  file_size: number | null;
  raw_text: string | null;
  status: "draft" | "processed" | "archived" | string;
  extraction_status: "none" | "extracted" | "failed" | string;
  extraction_error: string | null;
  created_at: string;
  updated_at: string | null;
};

type SalesProfile = {
  id: string;
  name: string;
  product_type: string;
  tone: string;
  target_audience: string | null;
  main_goal: string | null;
  cta_type: string | null;
  qualification_questions: string | null;
  constraints: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string | null;
};

type SourceDraft = {
  title: string;
  source_type: "text" | "url" | "file";
  source_url: string;
  raw_text: string;
  status: "draft" | "processed" | "archived";
};

type ProfileDraft = {
  name: string;
  product_type: string;
  tone: string;
  target_audience: string;
  main_goal: string;
  cta_type: string;
  qualification_questions: string;
  constraints: string;
  is_default: boolean;
};

const SOURCE_TYPE_OPTIONS: Array<{ value: SourceDraft["source_type"]; label: string }> = [
  { value: "text", label: "Texte" },
  { value: "url", label: "Lien" },
  { value: "file", label: "Document" },
];

const SOURCE_STATUS_OPTIONS: Array<{ value: SourceDraft["status"]; label: string }> = [
  { value: "draft", label: "Brouillon" },
  { value: "processed", label: "Traité" },
  { value: "archived", label: "Archivé" },
];

const PRODUCT_PRESETS: Array<{
  label: string;
  draft: Omit<ProfileDraft, "name" | "is_default">;
}> = [
  {
    label: "Formation / Masterclass",
    draft: {
      product_type: "Formation / Masterclass",
      tone: "professionnel, clair et rassurant",
      target_audience: "Leads en recherche de montée en compétence rapide",
      main_goal: "Faire réserver un appel ou une inscription rapidement",
      cta_type: "Réserver maintenant",
      qualification_questions: "Quel est votre niveau actuel ?\nQuel objectif souhaitez-vous atteindre ?",
      constraints: "Ne pas promettre de résultat garanti. Rester aligné sur la base officielle.",
    },
  },
  {
    label: "Clinique / Soin",
    draft: {
      product_type: "Clinique / Soin",
      tone: "professionnel, clair et rassurant",
      target_audience: "Patients ou prospects recherchant un soin ou une prise en charge",
      main_goal: "Orienter vers une prise de rendez-vous ou une demande d’information",
      cta_type: "Prendre rendez-vous",
      qualification_questions: "Quel type de soin recherchez-vous ?\nAvez-vous une préférence de date ?",
      constraints: "Ne jamais inventer un diagnostic ou un avis médical.",
    },
  },
  {
    label: "E-commerce",
    draft: {
      product_type: "E-commerce",
      tone: "professionnel, clair et rassurant",
      target_audience: "Acheteurs en ligne ou prospects chauds",
      main_goal: "Faire passer à l’achat ou à la demande d’information produit",
      cta_type: "Voir l’offre",
      qualification_questions: "Quel produit vous intéresse ?\nSouhaitez-vous une recommandation ?",
      constraints: "Rester fidèle aux informations produit validées.",
    },
  },
  {
    label: "Immobilier",
    draft: {
      product_type: "Immobilier",
      tone: "professionnel, clair et rassurant",
      target_audience: "Acheteurs, investisseurs ou locataires potentiels",
      main_goal: "Qualifier le besoin et orienter vers un rendez-vous",
      cta_type: "Planifier une visite",
      qualification_questions: "Cherchez-vous à acheter ou à louer ?\nQuel budget ciblez-vous ?",
      constraints: "Ne pas promettre de disponibilité non validée.",
    },
  },
  {
    label: "Service B2B",
    draft: {
      product_type: "Service B2B",
      tone: "professionnel, clair et rassurant",
      target_audience: "Entreprises, décideurs ou équipes commerciales",
      main_goal: "Obtenir un rendez-vous ou une demande de devis",
      cta_type: "Demander un devis",
      qualification_questions: "Quel est votre besoin principal ?\nQuel est votre délai de décision ?",
      constraints: "Rester précis, factuel et orienté valeur.",
    },
  },
  {
    label: "Événement",
    draft: {
      product_type: "Événement",
      tone: "professionnel, clair et rassurant",
      target_audience: "Participants ou prospects intéressés par l’événement",
      main_goal: "Faire confirmer l’inscription ou la présence",
      cta_type: "S’inscrire",
      qualification_questions: "Souhaitez-vous assister en présentiel ou à distance ?\nÀ quelle date êtes-vous disponible ?",
      constraints: "Ne pas inventer d’informations logistiques.",
    },
  },
];

const DEFAULT_PROFILE_DRAFT: ProfileDraft = {
  name: "",
  product_type: "Général",
  tone: "professionnel, clair et rassurant",
  target_audience: "",
  main_goal: "",
  cta_type: "",
  qualification_questions: "",
  constraints: "",
  is_default: false,
};

function parseJsonResponse<T>(raw: string) {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Réponse serveur invalide. Rechargez la page ou vérifiez la route API.");
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function getSourceTypeLabel(type: string) {
  if (type === "url") return "Lien";
  if (type === "file") return "Document";
  return "Texte";
}

function getSourceStatusLabel(status: string) {
  if (status === "processed") return "Traité";
  if (status === "archived") return "Archivé";
  return "Brouillon";
}

function getStatusClass(status: string) {
  if (status === "processed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200";
  }

  if (status === "archived") {
    return "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
}

function getTextPreview(value: string | null, fallback: string) {
  const text = normalizeText(String(value ?? ""));
  if (!text) {
    return fallback;
  }
  return text;
}

function formatFileSize(value: number | null) {
  if (!value || value <= 0) {
    return "Taille inconnue";
  }

  if (value < 1024) {
    return `${value} o`;
  }

  const kilobytes = value / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} Ko`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} Mo`;
}

function sectionCardClass() {
  return "rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm shadow-slate-950/5 backdrop-blur-sm transition-all duration-150 hover:-translate-y-[1px] hover:border-[color:var(--app-accent-border)] hover:bg-[var(--app-panel-soft)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:shadow-black/20 dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.30)] sm:p-5";
}

function fieldClassName() {
  return "w-full rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50";
}

function sourceInitialState(): SourceDraft {
  return {
    title: "",
    source_type: "text",
    source_url: "",
    raw_text: "",
    status: "draft",
  };
}

function profileInitialState(): ProfileDraft {
  return { ...DEFAULT_PROFILE_DRAFT };
}

function compactDate(value: string | null) {
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

function EditorField({
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

function SourceEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  loading,
  submitLabel,
  selectedFile,
  onFileChange,
  allowFileUpload = false,
}: {
  value: SourceDraft;
  onChange: (next: SourceDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  loading: boolean;
  submitLabel: string;
  selectedFile?: File | null;
  onFileChange?: (next: File | null) => void;
  allowFileUpload?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <EditorField label="Titre" hint="Obligatoire">
          <input
            value={value.title}
            onChange={(event) => onChange({ ...value, title: event.target.value })}
            className={fieldClassName()}
            placeholder="Guide tarifaire produit"
          />
        </EditorField>

        <EditorField label="Type">
          <select
            value={value.source_type}
            onChange={(event) =>
              onChange({ ...value, source_type: event.target.value as SourceDraft["source_type"] })
            }
            className={fieldClassName()}
          >
            {SOURCE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </EditorField>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <EditorField label="Statut">
          <select
            value={value.status}
            onChange={(event) =>
              onChange({ ...value, status: event.target.value as SourceDraft["status"] })
            }
            className={fieldClassName()}
          >
            {SOURCE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </EditorField>

        {value.source_type === "url" ? (
          <EditorField label="Lien source" hint="URL publique ou interne">
            <input
              value={value.source_url}
              onChange={(event) => onChange({ ...value, source_url: event.target.value })}
              className={fieldClassName()}
              placeholder="https://..."
            />
          </EditorField>
        ) : null}
      </div>

      {value.source_type === "text" ? (
        <EditorField label="Informations produit" hint="Texte libre réutilisable">
          <textarea
            value={value.raw_text}
            onChange={(event) => onChange({ ...value, raw_text: event.target.value })}
            rows={5}
            className={`${fieldClassName()} min-h-[140px]`}
            placeholder="Détails produit, prix, bénéfices, modalités..."
          />
        </EditorField>
      ) : null}

      {value.source_type === "url" ? (
        <EditorField label="Informations produit" hint="Notes ou extrait de la page liée">
          <textarea
            value={value.raw_text}
            onChange={(event) => onChange({ ...value, raw_text: event.target.value })}
            rows={5}
            className={`${fieldClassName()} min-h-[140px]`}
            placeholder="Résumé du contenu source..."
          />
        </EditorField>
      ) : null}

      {value.source_type === "file" ? (
        allowFileUpload ? (
          <label className="grid gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
              Document
            </span>
            <div className="grid gap-3 rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <input
                type="file"
                accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => onFileChange?.(event.target.files?.[0] ?? null)}
                className="w-full text-sm text-[var(--app-muted)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--app-fg)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--app-bg)]"
              />
              <p className="text-sm leading-6 text-[var(--app-muted)]">
                Formats supportés : PDF, TXT ou DOCX. Le texte extrait sera enregistré dans la source produit.
              </p>
              {selectedFile ? (
                <p className="text-sm text-[var(--app-fg)]">
                  Fichier sélectionné : <span className="font-medium">{selectedFile.name}</span>
                </p>
              ) : (
                <p className="text-sm text-[var(--app-muted)]">Aucun fichier sélectionné.</p>
              )}
            </div>
          </label>
        ) : (
          <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-5 text-sm text-[var(--app-muted)]">
            Document déjà importé. Vous pouvez modifier le titre ou le statut, mais pas remplacer le fichier depuis cette vue.
          </div>
        )
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
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
    </form>
  );
}

function ProfileEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  loading,
  submitLabel,
}: {
  value: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  loading: boolean;
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <EditorField label="Nom du profil" hint="Obligatoire">
          <input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            className={fieldClassName()}
            placeholder="Profil commercial principal"
          />
        </EditorField>

        <EditorField label="Type de produit">
          <select
            value={value.product_type}
            onChange={(event) => onChange({ ...value, product_type: event.target.value })}
            className={fieldClassName()}
          >
            {[
              "Formation / Masterclass",
              "Clinique / Soin",
              "Immobilier",
              "E-commerce",
              "Service B2B",
              "Événement",
              "Général",
            ].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </EditorField>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRODUCT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange({ ...value, ...preset.draft, name: value.name || preset.label })}
            className="inline-flex rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-xs font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <EditorField label="Ton commercial" hint="Réutilisable pour la génération future">
        <textarea
          value={value.tone}
          onChange={(event) => onChange({ ...value, tone: event.target.value })}
          rows={3}
          className={`${fieldClassName()} min-h-[108px]`}
          placeholder="professionnel, clair et rassurant"
        />
      </EditorField>

      <div className="grid gap-3 lg:grid-cols-2">
        <EditorField label="Audience cible">
          <textarea
            value={value.target_audience}
            onChange={(event) => onChange({ ...value, target_audience: event.target.value })}
            rows={3}
            className={`${fieldClassName()} min-h-[108px]`}
            placeholder="Leads chauds, prospects informés..."
          />
        </EditorField>

        <EditorField label="Objectif principal">
          <textarea
            value={value.main_goal}
            onChange={(event) => onChange({ ...value, main_goal: event.target.value })}
            rows={3}
            className={`${fieldClassName()} min-h-[108px]`}
            placeholder="Obtenir un rendez-vous, un achat ou une demande d'information"
          />
        </EditorField>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <EditorField label="Type de CTA">
          <input
            value={value.cta_type}
            onChange={(event) => onChange({ ...value, cta_type: event.target.value })}
            className={fieldClassName()}
            placeholder="Réserver maintenant"
          />
        </EditorField>

        <label className="flex items-end gap-3 rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3">
          <button
            type="button"
            onClick={() => onChange({ ...value, is_default: !value.is_default })}
            className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-medium transition ${
              value.is_default
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
            }`}
          >
            {value.is_default ? "Profil par défaut" : "Définir par défaut"}
          </button>
          <div className="text-sm text-[var(--app-muted)]">Défaut réutilisable</div>
        </label>
      </div>

      <EditorField label="Questions de qualification">
        <textarea
          value={value.qualification_questions}
          onChange={(event) => onChange({ ...value, qualification_questions: event.target.value })}
          rows={4}
          className={`${fieldClassName()} min-h-[120px]`}
          placeholder="Quelle est votre priorité ?\nQuel budget ou délai ciblez-vous ?"
        />
      </EditorField>

      <EditorField label="Contraintes">
        <textarea
          value={value.constraints}
          onChange={(event) => onChange({ ...value, constraints: event.target.value })}
          rows={3}
          className={`${fieldClassName()} min-h-[108px]`}
          placeholder="Ne pas promettre de disponibilité non confirmée, rester factuel..."
        />
      </EditorField>

      <div className="flex flex-wrap items-center gap-3">
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
    </form>
  );
}

function SourceCard({
  source,
  onEdit,
  onToggleStatus,
  editing,
  draft,
  setDraft,
  onSave,
  onCancel,
  loading,
  selectedFile,
  onFileChange,
}: {
  source: ProductSource;
  onEdit: () => void;
  onToggleStatus: (next: ProductSource["status"]) => void;
  editing: boolean;
  draft: SourceDraft | null;
  setDraft: (next: SourceDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  loading: boolean;
  selectedFile?: File | null;
  onFileChange?: (next: File | null) => void;
}) {
  const title = source.title.trim();
  const preview =
    source.source_type === "file"
      ? source.extraction_status === "failed"
        ? source.extraction_error || "Impossible d’extraire le texte du document."
        : getTextPreview(source.raw_text, "Texte extrait manquant")
      : source.source_type === "url"
        ? getTextPreview(source.source_url, "Lien non renseigné")
        : getTextPreview(source.raw_text, "Informations produit manquantes");
  const extractionStatus =
    source.source_type === "file"
      ? source.extraction_status === "extracted"
        ? "Texte extrait"
        : source.extraction_status === "failed"
          ? "Échec extraction"
          : "Extraction en attente"
      : null;

  return (
    <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-sm transition-all duration-150 hover:-translate-y-[1px] hover:border-[color:var(--app-accent-border)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.30)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[var(--app-fg)]">{title}</h3>
            <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
              {getSourceTypeLabel(source.source_type)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClass(source.status)}`}>
              {getSourceStatusLabel(source.status)}
            </span>
            {extractionStatus ? (
              <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
                {extractionStatus}
              </span>
            ) : null}
          </div>

          <div className="mt-2 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
              Aperçu source
            </div>
            <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--app-fg)]">
              {preview}
            </div>
          </div>

          {source.source_type === "url" && source.raw_text ? (
            <div className="mt-3 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-muted)]">
              {source.raw_text}
            </div>
          ) : null}

          {source.source_type === "file" ? (
            <div className="mt-3 grid gap-2 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-muted)]">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-fg)]">
                  {source.file_name || "Document"}
                </span>
                <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-fg)]">
                  {formatFileSize(source.file_size)}
                </span>
                {source.file_mime_type ? (
                  <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-fg)]">
                    {source.file_mime_type}
                  </span>
                ) : null}
              </div>
              <div className="text-sm leading-6 text-[var(--app-fg)]">{preview}</div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 xl:items-end">
          <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
            Créée le {compactDate(source.created_at)}
          </div>
          <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
            Mise à jour le {compactDate(source.updated_at)}
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={() => onToggleStatus(source.status === "archived" ? "draft" : "archived")}
              className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
            >
              {source.status === "archived" ? "Réactiver" : "Archiver"}
            </button>
          </div>
        </div>
      </div>

      {editing && draft ? (
        <div className="mt-5 border-t border-[color:var(--app-border)] pt-5">
          <div className="mb-4 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">Édition rapide</p>
            <p className="text-sm leading-6 text-[var(--app-muted)]">Corrigez cette source sans quitter la liste.</p>
          </div>

          <SourceEditor
            value={draft}
            onChange={setDraft}
            onSubmit={onSave}
            onCancel={onCancel}
            loading={loading}
            submitLabel="Enregistrer"
            selectedFile={selectedFile}
            onFileChange={onFileChange}
            allowFileUpload={false}
          />
        </div>
      ) : null}
    </article>
  );
}

function ProfileCard({
  profile,
  onEdit,
  onSetDefault,
  editing,
  draft,
  setDraft,
  onSave,
  onCancel,
  loading,
}: {
  profile: SalesProfile;
  onEdit: () => void;
  onSetDefault: () => void;
  editing: boolean;
  draft: ProfileDraft | null;
  setDraft: (next: ProfileDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-sm transition-all duration-150 hover:-translate-y-[1px] hover:border-[color:var(--app-accent-border)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.30)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[var(--app-fg)]">{profile.name}</h3>
            <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
              {profile.product_type}
            </span>
            {profile.is_default ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                Défaut
              </span>
            ) : null}
          </div>

          <div className="mt-2 rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-fg)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">Ton</div>
            <div className="mt-2 whitespace-pre-line">{getTextPreview(profile.tone, "Ton non renseigné")}</div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-muted)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                Audience cible
              </div>
              <div className="mt-2 whitespace-pre-line">{getTextPreview(profile.target_audience, "Audience non renseignée")}</div>
            </div>
            <div className="rounded-[22px] border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm leading-6 text-[var(--app-muted)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                Objectif principal
              </div>
              <div className="mt-2 whitespace-pre-line">{getTextPreview(profile.main_goal, "Objectif non renseigné")}</div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 xl:items-end">
          <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
            Créé le {compactDate(profile.created_at)}
          </div>
          <div className="rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)]">
            Mis à jour le {compactDate(profile.updated_at)}
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
            >
              Modifier
            </button>
            {profile.is_default ? null : (
              <button
                type="button"
                onClick={onSetDefault}
                className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
              >
                Définir par défaut
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {profile.cta_type ? (
          <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-muted)]">
            CTA : {profile.cta_type}
          </span>
        ) : null}
        {profile.is_default ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
            Profil principal
          </span>
        ) : null}
      </div>

      {editing && draft ? (
        <div className="mt-5 border-t border-[color:var(--app-border)] pt-5">
          <div className="mb-4 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">Édition rapide</p>
            <p className="text-sm leading-6 text-[var(--app-muted)]">Corrigez ce profil commercial sans quitter la liste.</p>
          </div>

          <ProfileEditor
            value={draft}
            onChange={setDraft}
            onSubmit={onSave}
            onCancel={onCancel}
            loading={loading}
            submitLabel="Enregistrer"
          />
        </div>
      ) : null}
    </article>
  );
}

export default function KnowledgeBaseProductConfig() {
  const [sources, setSources] = useState<ProductSource[]>([]);
  const [profiles, setProfiles] = useState<SalesProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(sourceInitialState());
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(profileInitialState());

  useEffect(() => {
    let mounted = true;

    async function fetchJson(response: Response) {
      const raw = await response.text();
      return raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};
    }

    async function loadData() {
      try {
        const [sourcesResponse, profilesResponse] = await Promise.all([
          fetch("/api/knowledge-base/product-sources", { cache: "no-store" }),
          fetch("/api/knowledge-base/sales-profiles", { cache: "no-store" }),
        ]);

        const [sourcesData, profilesData] = await Promise.all([
          fetchJson(sourcesResponse),
          fetchJson(profilesResponse),
        ]);

        if (!sourcesResponse.ok) {
          throw new Error((sourcesData.error as string | undefined) ?? "Impossible de charger les sources produit.");
        }

        if (!profilesResponse.ok) {
          throw new Error((profilesData.error as string | undefined) ?? "Impossible de charger les profils commerciaux.");
        }

        if (!mounted) {
          return;
        }

        setSources(Array.isArray(sourcesData.items) ? (sourcesData.items as ProductSource[]) : []);
        setProfiles(Array.isArray(profilesData.items) ? (profilesData.items as SalesProfile[]) : []);
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Impossible de charger la section.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, []);

  async function reloadData() {
    setLoading(true);
    setError(null);
    try {
      const [sourcesResponse, profilesResponse] = await Promise.all([
        fetch("/api/knowledge-base/product-sources", { cache: "no-store" }),
        fetch("/api/knowledge-base/sales-profiles", { cache: "no-store" }),
      ]);

      const [sourcesRaw, profilesRaw] = await Promise.all([sourcesResponse.text(), profilesResponse.text()]);
      const sourcesData = sourcesRaw ? parseJsonResponse<Record<string, unknown>>(sourcesRaw) : {};
      const profilesData = profilesRaw ? parseJsonResponse<Record<string, unknown>>(profilesRaw) : {};

      if (!sourcesResponse.ok) {
        throw new Error((sourcesData.error as string | undefined) ?? "Impossible de charger les sources produit.");
      }

      if (!profilesResponse.ok) {
        throw new Error((profilesData.error as string | undefined) ?? "Impossible de charger les profils commerciaux.");
      }

      setSources(Array.isArray(sourcesData.items) ? (sourcesData.items as ProductSource[]) : []);
      setProfiles(Array.isArray(profilesData.items) ? (profilesData.items as SalesProfile[]) : []);
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "Impossible de recharger la section.");
    } finally {
      setLoading(false);
    }
  }

  function resetSourceDraft() {
    setSourceDraft(sourceInitialState());
    setSourceFile(null);
  }

  function resetProfileDraft() {
    setProfileDraft(profileInitialState());
  }

  function startSourceEdit(source: ProductSource) {
    setEditingSourceId(source.id);
    setSourceFile(null);
    setSourceDraft({
      title: source.title,
      source_type: (source.source_type as SourceDraft["source_type"]) || "text",
      source_url: source.source_url ?? "",
      raw_text: source.raw_text ?? "",
      status: (source.status as SourceDraft["status"]) || "draft",
    });
    setSourceOpen(true);
  }

  function startProfileEdit(profile: SalesProfile) {
    setEditingProfileId(profile.id);
    setProfileDraft({
      name: profile.name,
      product_type: profile.product_type,
      tone: profile.tone,
      target_audience: profile.target_audience ?? "",
      main_goal: profile.main_goal ?? "",
      cta_type: profile.cta_type ?? "",
      qualification_questions: profile.qualification_questions ?? "",
      constraints: profile.constraints ?? "",
      is_default: profile.is_default,
    });
    setProfileOpen(true);
  }

  async function handleSourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingSource) return;

    const title = normalizeText(sourceDraft.title);
    const sourceType = sourceDraft.source_type;
    const sourceUrl = normalizeText(sourceDraft.source_url);
    const rawText = normalizeMultiline(sourceDraft.raw_text);
    const hasExistingSource = Boolean(editingSourceId);
    const resolvedTitle = title || sourceFile?.name || "";

    if (sourceType === "url" && !sourceUrl) {
      setSourceError("L’URL est obligatoire pour une source de type lien.");
      return;
    }

    if (sourceType === "text" && !rawText) {
      setSourceError("Le texte produit est obligatoire pour une source texte.");
      return;
    }

    if (sourceType === "file") {
      if (!hasExistingSource && !sourceFile) {
        setSourceError("Choisissez un document PDF, TXT ou DOCX.");
        return;
      }

      if (!resolvedTitle) {
        setSourceError("Le titre de la source est requis.");
        return;
      }
    } else if (!title) {
      setSourceError("Le titre de la source est obligatoire.");
      return;
    }

    setSavingSource(true);
    setSourceError(null);
    setSourceMessage(null);

    try {
      let response: Response;

      if (sourceType === "file" && !hasExistingSource) {
        const formData = new FormData();
        formData.set("file", sourceFile as File);
        formData.set("title", resolvedTitle || "");
        response = await fetch("/api/knowledge-base/product-sources/upload", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch(
          hasExistingSource
            ? `/api/knowledge-base/product-sources/${editingSourceId}`
            : "/api/knowledge-base/product-sources",
          {
            method: hasExistingSource ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: sourceType === "file" ? resolvedTitle || title : title,
              source_type: sourceType,
              source_url: sourceType === "url" ? sourceUrl : sourceDraft.source_url,
              raw_text: sourceType === "file" ? undefined : rawText,
              status: sourceDraft.status,
            }),
          }
        );
      }

      const raw = await response.text();
      const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Impossible d’enregistrer la source.");
      }

      const nextItem = data.item as ProductSource | null;
      if (nextItem) {
        setSources((prev) => [nextItem, ...prev.filter((item) => item.id !== nextItem.id)]);
      } else {
        await reloadData();
      }

      const uploadWarning = typeof data.warning === "string" ? data.warning : null;
      setSourceMessage(
        uploadWarning
          ? uploadWarning
          : sourceType === "file" && !hasExistingSource
            ? "Document importé et texte extrait."
          : hasExistingSource
            ? "Source mise à jour."
            : "Source enregistrée."
      );
      setSourceOpen(false);
      setEditingSourceId(null);
      resetSourceDraft();
    } catch (submitError) {
      setSourceError(submitError instanceof Error ? submitError.message : "Impossible d’enregistrer la source.");
    } finally {
      setSavingSource(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile) return;

    const name = normalizeText(profileDraft.name);
    const productType = normalizeText(profileDraft.product_type);
    const tone = normalizeMultiline(profileDraft.tone) || "professionnel, clair et rassurant";

    if (!name || !productType) {
      setProfileError("Le nom du profil et le type de produit sont obligatoires.");
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await fetch(
        editingProfileId ? `/api/knowledge-base/sales-profiles/${editingProfileId}` : "/api/knowledge-base/sales-profiles",
        {
          method: editingProfileId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            product_type: productType,
            tone,
            target_audience: normalizeMultiline(profileDraft.target_audience),
            main_goal: normalizeMultiline(profileDraft.main_goal),
            cta_type: normalizeText(profileDraft.cta_type),
            qualification_questions: normalizeMultiline(profileDraft.qualification_questions),
            constraints: normalizeMultiline(profileDraft.constraints),
            is_default: profileDraft.is_default,
          }),
        }
      );

      const raw = await response.text();
      const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Impossible d’enregistrer le profil.");
      }

      const nextItem = data.item as SalesProfile | null;
      if (nextItem) {
        setProfiles((prev) => [nextItem, ...prev.filter((item) => item.id !== nextItem.id)]);
      } else {
        await reloadData();
      }

      setProfileMessage(editingProfileId ? "Profil mis à jour." : "Profil enregistré.");
      setProfileOpen(false);
      setEditingProfileId(null);
      resetProfileDraft();
    } catch (submitError) {
      setProfileError(submitError instanceof Error ? submitError.message : "Impossible d’enregistrer le profil.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleToggleSourceStatus(source: ProductSource) {
    const nextStatus: SourceDraft["status"] = source.status === "archived" ? "draft" : "archived";
    setSources((prev) =>
      prev.map((item) => (item.id === source.id ? { ...item, status: nextStatus } : item))
    );

    try {
      const response = await fetch(`/api/knowledge-base/product-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const raw = await response.text();
      const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Impossible de modifier la source.");
      }

      const nextItem = data.item as ProductSource | null;
      if (nextItem) {
        setSources((prev) => prev.map((item) => (item.id === nextItem.id ? nextItem : item)));
      }
    } catch (toggleError) {
      setSources((prev) =>
        prev.map((item) => (item.id === source.id ? { ...item, status: source.status } : item))
      );
      setSourceError(toggleError instanceof Error ? toggleError.message : "Impossible de modifier la source.");
    }
  }

  async function handleSetDefault(profile: SalesProfile) {
    setProfiles((prev) => prev.map((item) => ({ ...item, is_default: item.id === profile.id })));

    try {
      const response = await fetch(`/api/knowledge-base/sales-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });

      const raw = await response.text();
      const data = raw ? parseJsonResponse<Record<string, unknown>>(raw) : {};

      if (!response.ok || !data.success) {
        throw new Error((data.error as string | undefined) ?? "Impossible de définir le profil par défaut.");
      }

      const nextItem = data.item as SalesProfile | null;
      if (nextItem) {
        setProfiles((prev) =>
          prev.map((item) => (item.id === nextItem.id ? nextItem : { ...item, is_default: false }))
        );
      }
    } catch (defaultError) {
      setProfiles((prev) => prev.map((item) => ({ ...item, is_default: item.id === profile.id })));
      setProfileError(defaultError instanceof Error ? defaultError.message : "Impossible de définir le profil par défaut.");
    }
  }

  const sourceCount = useMemo(() => sources.length, [sources.length]);
  const profileCount = useMemo(() => profiles.length, [profiles.length]);

  return (
    <section className="mt-8 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
            Nouvelle configuration
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--app-fg)] sm:text-2xl">
            Sources produit & profils commerciaux
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
            Préparez les informations produit et les profils de vente utilisés pour générer des propositions de questions/réponses. Les réponses ne seront ajoutées à la base officielle qu’après validation humaine.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-sm text-[var(--app-fg)]">
            {sourceCount} sources
          </span>
          <span className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-sm text-[var(--app-fg)]">
            {profileCount} profils
          </span>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className={sectionCardClass()}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                Sources produit
              </p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--app-fg)]">Informations à réutiliser</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
                Ajoutez des sources texte, lien ou fichier placeholder pour préparer la future génération.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSourceOpen((value) => !value);
                setEditingSourceId(null);
                resetSourceDraft();
              }}
              className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
            >
              {sourceOpen ? "Fermer" : "Ajouter une source"}
            </button>
          </div>

          {sourceOpen ? (
            <div className="mt-4 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4">
              <SourceEditor
                value={sourceDraft}
                onChange={setSourceDraft}
                onSubmit={handleSourceSubmit}
                loading={savingSource}
                submitLabel={
                  sourceDraft.source_type === "file"
                    ? editingSourceId
                      ? "Enregistrer"
                      : "Importer le document"
                    : editingSourceId
                      ? "Enregistrer"
                      : "Sauvegarder"
                }
                selectedFile={sourceFile}
                onFileChange={setSourceFile}
                allowFileUpload={!editingSourceId}
              />
              {sourceMessage ? <p className="mt-3 text-sm text-emerald-400">{sourceMessage}</p> : null}
              {sourceError ? <p className="mt-3 text-sm text-rose-400">{sourceError}</p> : null}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
                Chargement des sources...
              </div>
            ) : sources.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
                Aucune source pour le moment.
              </div>
            ) : (
              sources.map((source) => {
                const editing = editingSourceId === source.id;
                return (
                  <SourceCard
                    key={source.id}
                    source={source}
                    onEdit={() => startSourceEdit(source)}
                    onToggleStatus={() => void handleToggleSourceStatus(source)}
                    editing={editing}
                    draft={editing ? sourceDraft : null}
                    setDraft={setSourceDraft}
                    onSave={handleSourceSubmit}
                    onCancel={() => {
                      setEditingSourceId(null);
                      resetSourceDraft();
                    }}
                    loading={savingSource}
                    selectedFile={sourceFile}
                    onFileChange={setSourceFile}
                  />
                );
              })
            )}
          </div>
        </section>

        <section className={sectionCardClass()}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                Profils commerciaux
              </p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--app-fg)]">Cadres de vente réutilisables</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
                Définissez le ton, l’audience, les objectifs et les questions de qualification par type de produit.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setProfileOpen((value) => !value);
                setEditingProfileId(null);
                resetProfileDraft();
              }}
              className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
            >
              {profileOpen ? "Fermer" : "Ajouter un profil"}
            </button>
          </div>

          {profileOpen ? (
            <div className="mt-4 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4">
              <ProfileEditor
                value={profileDraft}
                onChange={setProfileDraft}
                onSubmit={handleProfileSubmit}
                loading={savingProfile}
                submitLabel={editingProfileId ? "Enregistrer" : "Sauvegarder"}
              />
              {profileMessage ? <p className="mt-3 text-sm text-emerald-400">{profileMessage}</p> : null}
              {profileError ? <p className="mt-3 text-sm text-rose-400">{profileError}</p> : null}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
                Chargement des profils...
              </div>
            ) : profiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
                Aucun profil pour le moment.
              </div>
            ) : (
              profiles.map((profile) => {
                const editing = editingProfileId === profile.id;
                return (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    onEdit={() => startProfileEdit(profile)}
                    onSetDefault={() => void handleSetDefault(profile)}
                    editing={editing}
                    draft={editing ? profileDraft : null}
                    setDraft={setProfileDraft}
                    onSave={handleProfileSubmit}
                    onCancel={() => {
                      setEditingProfileId(null);
                      resetProfileDraft();
                    }}
                    loading={savingProfile}
                  />
                );
              })
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

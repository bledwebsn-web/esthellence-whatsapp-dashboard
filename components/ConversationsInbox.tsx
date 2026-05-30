"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

type ConversationInboxItem = {
  conversation_id: string;
  whatsapp_name: string | null;
  whatsapp_number: string | null;
  status: string;
  urgency_level: string | null;
  detected_intent: string | null;
  detected_language: string | null;
  ai_summary: string | null;
  ai_suggested_status: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_type: string | null;
  last_direction: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  message_count: number | null;
  auto_reply_enabled: boolean | null;
  needs_human: boolean | null;
  created_at: string;
};

type ConversationsInboxProps = {
  conversations: ConversationInboxItem[];
};

type StatusFilter =
  | "all"
  | "nouveau"
  | "en_cours"
  | "qualifié"
  | "rdv"
  | "à_rappeler"
  | "perdu";

type UrgencyFilter = "all" | "high" | "medium" | "low";
type TreatmentFilter = "all" | "pending" | "human" | "auto";
type IntentFilter = "all" | "pricing" | "schedule" | "registration" | "eligibility" | "other";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "nouveau", label: "Nouveau" },
  { value: "en_cours", label: "En cours" },
  { value: "qualifié", label: "Qualifié" },
  { value: "rdv", label: "RDV" },
  { value: "à_rappeler", label: "À rappeler" },
  { value: "perdu", label: "Perdu" },
];

const URGENCY_OPTIONS: Array<{ value: UrgencyFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "high", label: "Haute" },
  { value: "medium", label: "Moyenne" },
  { value: "low", label: "Faible" },
];

const TREATMENT_OPTIONS: Array<{ value: TreatmentFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "pending", label: "À traiter" },
  { value: "human", label: "Besoin humain" },
  { value: "auto", label: "Auto-réponse active" },
];

const INTENT_OPTIONS: Array<{ value: IntentFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "pricing", label: "Prix" },
  { value: "schedule", label: "RDV / Dates" },
  { value: "registration", label: "Inscription" },
  { value: "eligibility", label: "Éligibilité" },
  { value: "other", label: "Autre / Unknown" },
];

function stripAccents(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = stripAccents(value ?? "");

  if (normalized === "qualifie") return "qualifié";
  if (normalized === "a_rappeler") return "à_rappeler";
  if (normalized === "en_cours") return "en_cours";
  if (normalized === "nouveau") return "nouveau";
  if (normalized === "rdv") return "rdv";
  if (normalized === "perdu") return "perdu";
  if (normalized === "spam") return "spam";

  return normalized || "nouveau";
}

function normalizeIntent(value: string | null | undefined) {
  const normalized = stripAccents(value ?? "");

  if (
    normalized.includes("pricing") ||
    normalized.includes("price") ||
    normalized.includes("tarif") ||
    normalized.includes("prix") ||
    normalized.includes("cout") ||
    normalized.includes("combien")
  ) {
    return "pricing";
  }

  if (
    normalized.includes("schedule") ||
    normalized.includes("date") ||
    normalized.includes("planning") ||
    normalized.includes("calendrier") ||
    normalized.includes("quand")
  ) {
    return "schedule";
  }

  if (
    normalized.includes("registration") ||
    normalized.includes("inscription") ||
    normalized.includes("inscrire") ||
    normalized.includes("reserver") ||
    normalized.includes("réserver")
  ) {
    return "registration";
  }

  if (
    normalized.includes("eligibility") ||
    normalized.includes("eligible") ||
    normalized.includes("pour qui") ||
    normalized.includes("medecin")
  ) {
    return "eligibility";
  }

  if (normalized === "media_recu" || normalized === "media_received") {
    return "other";
  }

  return normalized || "other";
}

function formatRelativeDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (date >= todayStart) {
    return `Aujourd’hui ${time}`;
  }

  if (date >= yesterdayStart && date < todayStart) {
    return `Hier ${time}`;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getLastMessageLabel(conversation: ConversationInboxItem) {
  const content = normalizeWhitespace(conversation.last_message ?? "");
  const messageType = stripAccents(conversation.last_message_type ?? "");

  if (content && !content.startsWith("[")) {
    return content;
  }

  if (messageType === "image") return "📷 Image";
  if (messageType === "audio" || messageType === "voice") return "🎙️ Message vocal";
  if (messageType === "document") return "📎 Document";
  if (messageType === "video") return "🎥 Vidéo";
  if (messageType === "sticker") return "✨ Sticker";

  if (content) {
    return content;
  }

  return "Aucun message";
}

function getUrgencyLabel(urgency: string | null | undefined) {
  const normalized = stripAccents(urgency ?? "");
  if (normalized === "high") return "Haute";
  if (normalized === "medium") return "Moyenne";
  if (normalized === "low") return "Faible";
  return "—";
}

function getUrgencyBadgeClass(urgency: string | null | undefined) {
  const normalized = stripAccents(urgency ?? "");
  if (normalized === "high") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200";
  }
  if (normalized === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
  }
  return "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300";
}

function getStatusBadgeClass(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "qualifié" || normalized === "rdv") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200";
  }

  if (normalized === "perdu") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200";
  }

  if (normalized === "à_rappeler") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
  }

  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300";
}

function getTreatmentState(conversation: ConversationInboxItem) {
  const lastInboundAt = conversation.last_inbound_at ? new Date(conversation.last_inbound_at) : null;
  const lastOutboundAt = conversation.last_outbound_at ? new Date(conversation.last_outbound_at) : null;
  const hasPendingInbound =
    Boolean(lastInboundAt) &&
    (!lastOutboundAt || (lastInboundAt && lastOutboundAt && lastInboundAt > lastOutboundAt));
  const needsHuman = Boolean(conversation.needs_human || hasPendingInbound);
  const autoReplyActive = conversation.auto_reply_enabled !== false;

  return {
    needsHuman,
    autoReplyActive,
    isPending: hasPendingInbound,
  };
}

function getConversationSearchText(conversation: ConversationInboxItem) {
  return stripAccents(
    [
      conversation.whatsapp_name,
      conversation.whatsapp_number,
      conversation.last_message,
      conversation.ai_summary,
      conversation.detected_intent,
      conversation.detected_language,
      conversation.status,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export default function ConversationsInbox({ conversations }: ConversationsInboxProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [treatmentFilter, setTreatmentFilter] = useState<TreatmentFilter>("all");
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = stripAccents(query);

    const filtered = conversations.filter((conversation) => {
      const normalizedStatus = normalizeStatus(conversation.status);
      const normalizedIntent = normalizeIntent(conversation.detected_intent);
      const { needsHuman, autoReplyActive, isPending } = getTreatmentState(conversation);

      if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
        return false;
      }

      if (urgencyFilter !== "all" && stripAccents(conversation.urgency_level ?? "") !== urgencyFilter) {
        return false;
      }

      if (treatmentFilter === "pending" && !isPending) {
        return false;
      }

      if (treatmentFilter === "human" && !needsHuman) {
        return false;
      }

      if (treatmentFilter === "auto" && !autoReplyActive) {
        return false;
      }

      if (intentFilter !== "all") {
        if (intentFilter === "other") {
          if (["pricing", "schedule", "registration", "eligibility"].includes(normalizedIntent)) {
            return false;
          }
        } else if (normalizedIntent !== intentFilter) {
          return false;
        }
      }

      if (normalizedQuery) {
        const searchText = getConversationSearchText(conversation);
        if (!searchText.includes(normalizedQuery)) {
          return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const aDate = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime();
      const bDate = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime();
      return bDate - aDate;
    });
  }, [conversations, intentFilter, query, statusFilter, treatmentFilter, urgencyFilter]);

  const stats = useMemo(() => {
    const total = conversations.length;
    const qualified = conversations.filter((conversation) => normalizeStatus(conversation.status) === "qualifié").length;
    const needsHuman = conversations.filter((conversation) => getTreatmentState(conversation).needsHuman).length;
    const pending = conversations.filter((conversation) => getTreatmentState(conversation).isPending).length;

    return { total, qualified, needsHuman, pending };
  }, [conversations]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      router.refresh();
    } finally {
      window.setTimeout(() => setRefreshing(false), 250);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="sticky top-0 z-30 border-b border-[color:var(--app-border)] bg-[var(--app-header)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Conversations</h1>
                <span className="rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-3 py-1 text-xs font-medium text-[var(--app-fg)]">
                  {stats.total} conversations
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--app-muted)]">
                Leads WhatsApp Esthellence
              </p>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Actualisation…" : "Rafraîchir"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 overflow-x-auto pb-1">
            <StatPill label="Total" value={stats.total} />
            <StatPill label="À traiter" value={stats.pending} />
            <StatPill label="Qualifiés" value={stats.qualified} />
            <StatPill label="Humain" value={stats.needsHuman} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <label className="relative block">
              <span className="sr-only">Rechercher un lead, téléphone, message…</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un lead, téléphone, message…"
                className="w-full rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-[var(--app-fg)] outline-none transition placeholder:text-[var(--app-muted)] focus:border-cyan-400/50"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setUrgencyFilter("all");
                  setTreatmentFilter("all");
                  setIntentFilter("all");
                }}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-4 text-sm font-medium text-[var(--app-muted)] transition hover:bg-[var(--app-panel-strong)]"
              >
                Réinitialiser
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <FilterRow
              label="Statut"
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(next) => setStatusFilter(next as StatusFilter)}
            />
            <FilterRow
              label="Urgence"
              options={URGENCY_OPTIONS}
              value={urgencyFilter}
              onChange={(next) => setUrgencyFilter(next as UrgencyFilter)}
            />
            <FilterRow
              label="Traitement"
              options={TREATMENT_OPTIONS}
              value={treatmentFilter}
              onChange={(next) => setTreatmentFilter(next as TreatmentFilter)}
            />
            <FilterRow
              label="Intention"
              options={INTENT_OPTIONS}
              value={intentFilter}
              onChange={(next) => setIntentFilter(next as IntentFilter)}
            />
          </div>
        </div>

        <div className="mt-6">
          {filteredConversations.length === 0 ? (
            <EmptyState hasQuery={Boolean(query.trim())} />
          ) : (
            <div className="space-y-3">
              {filteredConversations.map((conversation) => {
                const treatment = getTreatmentState(conversation);
                const statusLabel = normalizeStatus(conversation.status);
                const lastMessage = getLastMessageLabel(conversation);
                const lastMessageAt = conversation.last_message_at ?? conversation.created_at;
                const phone = conversation.whatsapp_number ?? "—";
                const messageCount = conversation.message_count ?? 0;
                const languageLabel = conversation.detected_language?.trim() || "Langue inconnue";
                const messageCountLabel = `${messageCount} message${messageCount > 1 ? "s" : ""}`;
                const displayName = conversation.whatsapp_name?.trim() || phone;

                return (
                  <Link
                    key={conversation.conversation_id}
                    href={`/conversations/${conversation.conversation_id}`}
                    aria-label={`Ouvrir la conversation de ${displayName}`}
                    className="group block cursor-pointer rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm shadow-slate-950/5 transition-all duration-150 transform-gpu hover:-translate-y-[1px] hover:border-[color:var(--app-accent-border)] hover:bg-[var(--app-panel-soft)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-bg)] dark:shadow-black/20 dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.35)] sm:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold text-[var(--app-fg)]">
                            {displayName}
                          </div>
                          {treatment.needsHuman ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
                              Besoin humain
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusBadgeClass(
                              conversation.status
                            )}`}
                          >
                            {statusLabel}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center text-xs text-[var(--app-muted)]">
                          <span className="truncate">{phone}</span>
                          <span
                            aria-hidden="true"
                            className="mx-2 select-none text-slate-400 dark:text-slate-500"
                          >
                            |
                          </span>
                          <span>{messageCountLabel}</span>
                          <span
                            aria-hidden="true"
                            className="mx-2 select-none text-slate-400 dark:text-slate-500"
                          >
                            |
                          </span>
                          <span className="truncate">{languageLabel}</span>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                            Dernier message
                          </div>
                          <div className="text-sm leading-6 text-[var(--app-fg)]">{lastMessage}</div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                        <div className="text-sm font-medium text-[var(--app-fg)]">
                          {formatRelativeDate(lastMessageAt)}
                        </div>
                        <div className="text-xs text-[var(--app-muted)]">
                          {conversation.message_count ?? 0} messages
                        </div>
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <Badge
                            label={`Urgence ${getUrgencyLabel(conversation.urgency_level)}`}
                            className={getUrgencyBadgeClass(conversation.urgency_level)}
                          />
                          <Badge
                            label={
                              conversation.auto_reply_enabled === false
                                ? "Auto-réponse désactivée"
                                : "Auto-réponse active"
                            }
                            className={
                              conversation.auto_reply_enabled === false
                                ? "border-slate-200 bg-slate-100 text-slate-600"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
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

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-sm text-[var(--app-fg)]">
      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--app-muted)]">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-[color:var(--app-border)] bg-[var(--app-panel)] px-6 py-16 text-center">
      <div className="text-base font-semibold text-[var(--app-fg)]">
        {hasQuery ? "Aucun lead ne correspond à cette recherche." : "Aucune conversation pour le moment."}
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
        Saisissez les premiers leads WhatsApp depuis vos campagnes Meta Ads.
      </p>
    </div>
  );
}

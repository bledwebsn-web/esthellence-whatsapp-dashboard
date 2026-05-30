import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { db } from "@/lib/db";

export type DashboardConversationRow = {
  conversation_id: string;
  profile_name: string | null;
  wa_id: string;
  phone: string | null;
  status: string;
  urgency_level: string | null;
  detected_intent: string | null;
  detected_language: string | null;
  ai_summary: string | null;
  ai_suggested_status: string | null;
  needs_human: boolean | null;
  auto_reply_enabled: boolean | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_type: string | null;
  last_direction: string | null;
  message_count: number | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
};

export type IntentStat = {
  key: string;
  label: string;
  count: number;
};

export type DashboardData = {
  stats: {
    total_conversations: number;
    to_handle: number;
    qualified: number;
    needs_human: number;
    auto_replies_sent: number;
    auto_reply_rate: number;
  };
  priority_conversations: DashboardConversationRow[];
  recent_conversations: DashboardConversationRow[];
  intentions: IntentStat[];
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  image: "📷 Image",
  audio: "🎙️ Message vocal",
  voice: "🎙️ Message vocal",
  document: "📎 Document",
  video: "🎥 Vidéo",
  sticker: "✨ Sticker",
};

const INTENT_ORDER = [
  "pricing",
  "schedule",
  "registration",
  "eligibility",
  "general_info",
  "media_received",
  "unknown",
] as const;

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

  if (normalized === "qualifie" || normalized === "qualified") return "qualifié";
  if (normalized === "a_rappeler" || normalized === "a rappeler") return "à_rappeler";
  if (normalized === "en_cours" || normalized === "in_progress") return "en_cours";
  if (normalized === "nouveau" || normalized === "new") return "nouveau";
  if (normalized === "rdv" || normalized === "rendez_vous") return "rdv";
  if (normalized === "perdu" || normalized === "lost") return "perdu";
  if (normalized === "spam") return "spam";
  return normalized || "nouveau";
}

function normalizeIntent(value: string | null | undefined, messageType: string | null | undefined) {
  const normalized = stripAccents(value ?? "");

  if (!normalized) {
    const mediaType = stripAccents(messageType ?? "");
    if (["image", "audio", "voice", "document", "video", "sticker"].includes(mediaType)) {
      return "media_received";
    }
    return "unknown";
  }

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
    normalized.includes("calendar") ||
    normalized.includes("quand")
  ) {
    return "schedule";
  }

  if (
    normalized.includes("registration") ||
    normalized.includes("inscription") ||
    normalized.includes("inscrire") ||
    normalized.includes("reserver")
  ) {
    return "registration";
  }

  if (
    normalized.includes("eligibility") ||
    normalized.includes("eligible") ||
    normalized.includes("pour qui")
  ) {
    return "eligibility";
  }

  if (
    normalized.includes("location") ||
    normalized.includes("programme") ||
    normalized.includes("certificate") ||
    normalized.includes("greeting")
  ) {
    return "general_info";
  }

  if (normalized.includes("media_received") || normalized.includes("media recu")) {
    return "media_received";
  }

  return normalized || "unknown";
}

function getIntentLabel(intent: string) {
  switch (intent) {
    case "pricing":
      return "Prix";
    case "schedule":
      return "Dates";
    case "registration":
      return "Inscription";
    case "eligibility":
      return "Éligibilité";
    case "general_info":
      return "Infos générales";
    case "media_received":
      return "Média reçu";
    default:
      return "Inconnu";
  }
}

function getUrgencyLabel(urgency: string | null | undefined) {
  const normalized = stripAccents(urgency ?? "");
  if (normalized === "high") return "Haute";
  if (normalized === "medium") return "Moyenne";
  if (normalized === "low") return "Faible";
  return "Normal";
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

  if (normalized === "perdu" || normalized === "spam") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200";
  }

  if (normalized === "à_rappeler") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
  }

  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300";
}

function getRelativeDate(value: string | null) {
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

function getLastMessageLabel(conversation: DashboardConversationRow) {
  const content = normalizeWhitespace(conversation.last_message_preview ?? "");
  const messageType = stripAccents(conversation.last_message_type ?? "");

  if (content && !content.startsWith("[")) {
    return content;
  }

  if (messageType in MESSAGE_TYPE_LABELS) {
    return MESSAGE_TYPE_LABELS[messageType];
  }

  return content || "Aucun message";
}

function isInboundPending(conversation: DashboardConversationRow) {
  const lastInboundAt = conversation.last_inbound_at ? new Date(conversation.last_inbound_at) : null;
  const lastOutboundAt = conversation.last_outbound_at ? new Date(conversation.last_outbound_at) : null;

  return Boolean(lastInboundAt && (!lastOutboundAt || lastInboundAt > lastOutboundAt));
}

function getTreatmentState(conversation: DashboardConversationRow) {
  const status = normalizeStatus(conversation.status);
  const intent = normalizeIntent(conversation.detected_intent, conversation.last_message_type);
  const needsHuman = Boolean(conversation.needs_human || intent === "unknown" || intent === "media_received");
  const autoReplyActive = conversation.auto_reply_enabled !== false;
  const pending = isInboundPending(conversation);

  return {
    needsHuman,
    autoReplyActive,
    pending,
    status,
    intent,
    shouldHandle:
      needsHuman ||
      pending ||
      status === "nouveau" ||
      status === "en_cours" ||
      status === "à_rappeler",
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatRate(value: number) {
  return `${value.toFixed(1)} %`;
}

function computePriorityScore(conversation: DashboardConversationRow) {
  const treatment = getTreatmentState(conversation);
  let score = 0;

  if (treatment.needsHuman) score += 40;
  if (stripAccents(conversation.urgency_level ?? "") === "high") score += 30;
  if (stripAccents(conversation.urgency_level ?? "") === "medium") score += 15;
  if (treatment.pending) score += 20;
  if (treatment.status === "nouveau") score += 12;
  if (treatment.status === "en_cours") score += 8;
  if (treatment.intent === "unknown") score += 10;
  if (treatment.intent === "media_received") score += 10;

  return score;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-3.5 shadow-sm backdrop-blur-sm sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[color:var(--app-fg)] sm:text-base">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-[color:var(--app-muted)]">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "accent" | "emerald" | "amber" | "rose";
}) {
  const accentClass =
    tone === "accent"
      ? "bg-cyan-400/70 dark:bg-cyan-300/70"
      : tone === "emerald"
        ? "bg-emerald-500/70 dark:bg-emerald-300/70"
        : tone === "amber"
          ? "bg-amber-500/70 dark:bg-amber-300/70"
          : tone === "rose"
            ? "bg-rose-500/70 dark:bg-rose-300/70"
            : "bg-slate-300 dark:bg-slate-500";

  return (
    <div className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-3 shadow-sm transition-colors hover:bg-[color:var(--app-panel-strong)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">{label}</div>
          <div className={`mt-2 h-1.5 w-10 rounded-full ${accentClass}`} />
        </div>
        <div className="text-right">
          <div className="text-[26px] font-semibold tracking-tight text-[color:var(--app-fg)] sm:text-[28px]">{value}</div>
        </div>
      </div>
      <p className="mt-1.5 text-sm leading-5 text-[color:var(--app-muted)]">{caption}</p>
    </div>
  );
}

function ConversationCard({
  conversation,
  compact = false,
}: {
  conversation: DashboardConversationRow;
  compact?: boolean;
}) {
  const treatment = getTreatmentState(conversation);
  const lastMessage = getLastMessageLabel(conversation);

  return (
    <article className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] p-3 transition hover:bg-[color:var(--app-panel-strong)] sm:p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h3 className="truncate text-sm font-semibold text-[color:var(--app-fg)] sm:text-[15px]">
              {conversation.profile_name ?? conversation.phone ?? conversation.wa_id}
            </h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeClass(conversation.status)}`}>
              {conversation.status || "nouveau"}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getUrgencyBadgeClass(conversation.urgency_level)}`}>
              Urgence {getUrgencyLabel(conversation.urgency_level)}
            </span>
            {treatment.needsHuman ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                Humain requis
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[color:var(--app-muted)] sm:text-xs">
            {conversation.phone ?? conversation.wa_id} ? {conversation.message_count ?? 0} messages
            {conversation.detected_language ? ` ? ${conversation.detected_language}` : ""}
          </div>
        </div>
        <Link
          href={`/conversations/${conversation.conversation_id}`}
          className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--app-fg)] transition hover:bg-[color:var(--app-panel-strong)] sm:text-xs"
        >
          Ouvrir
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--app-muted)]">
            Dernier message
          </div>
          <div className="mt-1 text-sm leading-6 text-[color:var(--app-fg)]">{lastMessage}</div>
        </div>

        {!compact ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-2 py-0.5 font-medium text-[color:var(--app-muted)]">
              {getRelativeDate(conversation.last_message_at)}
            </span>
            {treatment.autoReplyActive ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                Auto-r?ponse active
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
                Auto-r?ponse d?sactiv?e
              </span>
            )}
            <span className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-2 py-0.5 font-medium text-[color:var(--app-muted)]">
              {getIntentLabel(treatment.intent)}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SectionEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] p-4 text-center">
      <div className="text-sm font-semibold text-[color:var(--app-fg)]">{title}</div>
      <p className="mt-1 text-sm leading-6 text-[color:var(--app-muted)]">{description}</p>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-3.5 transition hover:bg-[color:var(--app-panel-strong)]"
    >
      <div className="text-sm font-semibold text-[color:var(--app-fg)]">{title}</div>
      <p className="mt-1 text-sm leading-5 text-[color:var(--app-muted)]">{description}</p>
    </Link>
  );
}

export async function loadDashboardData(): Promise<DashboardData> {
  const conversationsResult = await db.query<DashboardConversationRow>(
    `
    select
      conversations.id as conversation_id,
      contacts.profile_name,
      contacts.wa_id,
      contacts.phone,
      conversations.status,
      conversations.urgency_level,
      conversations.detected_intent,
      conversations.detected_language,
      conversations.ai_summary,
      conversations.ai_suggested_status,
      coalesce(conversations.human_takeover, false) as needs_human,
      coalesce(conversations.auto_reply_enabled, true) as auto_reply_enabled,
      coalesce(conversations.last_message_preview, latest_message.content) as last_message_preview,
      coalesce(conversations.last_message_at, latest_message.created_at, conversations.created_at) as last_message_at,
      latest_message.message_type as last_message_type,
      latest_message.direction as last_direction,
      message_count.total as message_count,
      latest_inbound.created_at as last_inbound_at,
      latest_outbound.created_at as last_outbound_at,
      conversations.created_at
    from conversations
    inner join contacts on contacts.id = conversations.contact_id
    left join lateral (
      select
        messages.content,
        messages.message_type,
        messages.direction,
        messages.created_at
      from messages
      where messages.conversation_id = conversations.id
      order by messages.created_at desc
      limit 1
    ) latest_message on true
    left join lateral (
      select messages.created_at
      from messages
      where messages.conversation_id = conversations.id
        and messages.direction = 'inbound'
      order by messages.created_at desc
      limit 1
    ) latest_inbound on true
    left join lateral (
      select messages.created_at
      from messages
      where messages.conversation_id = conversations.id
        and messages.direction = 'outbound'
      order by messages.created_at desc
      limit 1
    ) latest_outbound on true
    left join lateral (
      select count(*)::int as total
      from messages
      where messages.conversation_id = conversations.id
    ) message_count on true
    order by coalesce(conversations.last_message_at, latest_message.created_at, conversations.created_at) desc nulls last,
             conversations.created_at desc
    limit 200
    `
  );

  const rows = conversationsResult.rows ?? [];

  let autoRepliesSent = 0;
  const autoReplyLogsExists = await db.query<{ exists: string | null }>(
    `select to_regclass($1) as exists`,
    ["auto_reply_logs"]
  );

  if (autoReplyLogsExists.rows[0]?.exists) {
    const autoReplyResult = await db.query<{ total: number }>(
      `
      select count(*)::int as total
      from auto_reply_logs
      where decision = 'sent'
      `
    );
    autoRepliesSent = autoReplyResult.rows[0]?.total ?? 0;
  }

  const totalConversations = rows.length;
  const qualified = rows.filter((row) => {
    const status = normalizeStatus(row.status);
    return status === "qualifié" || status === "rdv";
  }).length;

  const needsHuman = rows.filter((row) => getTreatmentState(row).needsHuman).length;
  const toHandle = rows.filter((row) => getTreatmentState(row).shouldHandle).length;

  const autoReplyRate = totalConversations > 0 ? (autoRepliesSent / totalConversations) * 100 : 0;

  const intentCounts = new Map<string, number>();
  for (const row of rows) {
    const intent = normalizeIntent(row.detected_intent, row.last_message_type);
    intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
  }

  const intentions = INTENT_ORDER.map((key) => ({
    key,
    label: getIntentLabel(key),
    count: intentCounts.get(key) ?? 0,
  })).filter((item) => item.count > 0);

  const priority_conversations = rows
    .slice()
    .sort((a, b) => computePriorityScore(b) - computePriorityScore(a))
    .slice(0, 8);

  const recent_conversations = rows.slice().sort((a, b) => {
    const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return dateB - dateA;
  }).slice(0, 5);

  return {
    stats: {
      total_conversations: totalConversations,
      to_handle: toHandle,
      qualified,
      needs_human: needsHuman,
      auto_replies_sent: autoRepliesSent,
      auto_reply_rate: autoReplyRate,
    },
    priority_conversations,
    recent_conversations,
    intentions,
  };
}

export default function DashboardHome({ data }: { data: DashboardData }) {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[color:var(--app-fg)]">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-5 lg:px-8">
        <header className="sticky top-0 z-20 mb-4 rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-header)] px-3 py-3 backdrop-blur-xl sm:px-4 sm:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
                  Dashboard
                </p>
                <span className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-3 py-1 text-[11px] font-medium text-[color:var(--app-muted)]">
                  Pilotage des leads WhatsApp Esthellence
                </span>
              </div>
              <h1 className="mt-1 text-[28px] font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--app-muted)]">
                Vue rapide de l’activité, des conversations à traiter et des leads qualifiés issus des campagnes Meta Ads Click-to-WhatsApp.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              <Link
                href="/api/export/leads.csv"
                className="inline-flex items-center rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-3 py-2 text-xs font-medium text-[color:var(--app-fg)] transition hover:bg-[color:var(--app-panel-strong)] sm:px-4 sm:text-sm"
              >
                Exporter CSV
              </Link>
              <Link
                href="/conversations"
                className="inline-flex items-center rounded-full bg-[color:var(--app-fg)] px-3 py-2 text-xs font-semibold text-[color:var(--app-bg)] transition hover:opacity-90 sm:px-4 sm:text-sm"
              >
                Conversations
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            label="Leads reçus"
            value={formatNumber(data.stats.total_conversations)}
            caption="Conversations WhatsApp enregistrées."
            tone="accent"
          />
          <KpiCard
            label="À traiter"
            value={formatNumber(data.stats.to_handle)}
            caption="Dernier message inbound ou besoin humain."
            tone="amber"
          />
          <KpiCard
            label="Qualifiés"
            value={formatNumber(data.stats.qualified)}
            caption="Leads déjà qualifiés ou en RDV."
            tone="emerald"
          />
          <KpiCard
            label="Besoin humain"
            value={formatNumber(data.stats.needs_human)}
            caption="Demandes à reprendre par un conseiller."
            tone="rose"
          />
          <KpiCard
            label="Auto-réponses IA"
            value={formatNumber(data.stats.auto_replies_sent)}
            caption="Réponses automatiques envoyées."
          />
          <KpiCard
            label="Taux auto-réponse"
            value={formatRate(data.stats.auto_reply_rate)}
            caption="Part des conversations auto-répondues."
          />
        </section>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-6">
            <Section
              title="À traiter maintenant"
              description="Les leads les plus importants à reprendre en priorité."
            >
              {data.priority_conversations.length > 0 ? (
                <div className="grid gap-3">
                  {data.priority_conversations.map((conversation) => (
                    <ConversationCard key={conversation.conversation_id} conversation={conversation} />
                  ))}
                </div>
              ) : (
                <SectionEmptyState
                  title="Aucune conversation urgente pour le moment."
                  description="Les leads prioritaires apparaîtront ici lorsqu’un message inbound, une urgence ou un besoin humain sera détecté."
                />
              )}
            </Section>

            <Section
              title="Activité récente"
              description="Les dernières conversations modifiées pour reprendre le fil rapidement."
            >
              {data.recent_conversations.length > 0 ? (
                <div className="grid gap-3">
                  {data.recent_conversations.map((conversation) => (
                    <ConversationCard key={conversation.conversation_id} conversation={conversation} compact />
                  ))}
                </div>
              ) : (
                <SectionEmptyState
                  title="Pas encore d’activité récente."
                  description="Les derniers échanges WhatsApp apparaîtront ici dès les premiers messages reçus."
                />
              )}
            </Section>
          </div>

          <div className="space-y-6">
            <Section
              title="Intentions principales"
              description="Les intentions les plus fréquentes dans les leads WhatsApp."
            >
              {data.intentions.length > 0 ? (
                <div className="space-y-3">
                  {data.intentions.map((intent) => {
                    const max = Math.max(...data.intentions.map((item) => item.count), 1);
                    const width = Math.max(8, Math.round((intent.count / max) * 100));

                    return (
                      <div
                        key={intent.key}
                        className="rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[color:var(--app-fg)]">{intent.label}</div>
                            <div className="mt-1 text-xs text-[color:var(--app-muted)]">{intent.count} conversations</div>
                          </div>
                          <span className="rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-2.5 py-1 text-xs font-medium text-[color:var(--app-muted)]">
                            {formatNumber(intent.count)}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--app-border)]">
                          <div
                            className="h-full rounded-full bg-cyan-400/80"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <SectionEmptyState
                  title="Pas encore assez de données."
                  description="Les intentions détectées s’afficheront ici dès que les conversations auront été analysées."
                />
              )}
            </Section>

            <Section
              title="Accès rapide"
              description="Les raccourcis essentiels pour agir vite."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <QuickLink
                  href="/conversations"
                  title="Conversations"
                  description="Gérer les leads WhatsApp en cours."
                />
                <QuickLink
                  href="/knowledge-base"
                  title="Base de connaissances"
                  description="Modifier les réponses officielles."
                />
                <QuickLink
                  href="/settings"
                  title="Réglages WABAssist"
                  description="Configurer l’IA et l’auto-réponse."
                />
                <QuickLink
                  href="/api/export/leads.csv"
                  title="Export CSV"
                  description="Télécharger les leads pour suivi externe."
                />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}

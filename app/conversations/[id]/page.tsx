import { notFound } from "next/navigation";
import DashboardQuickLink from "@/components/DashboardQuickLink";
import GlassIconButton from "@/components/GlassIconButton";
import ConversationMessages from "@/components/ConversationMessages";
import LeadStatusSelect from "@/components/LeadStatusSelect";
import ManualReplyForm, {
  ConversationSummaryCard,
} from "@/components/ManualReplyForm";
import ThemeToggle from "@/components/ThemeToggle";
import {
  getMediaReviewLabel,
  isNonTextMediaMessageType,
} from "@/lib/analyze-conversation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  message_type: string;
  sender_type: string | null;
  source_label: string | null;
  delivery_status: string | null;
  read_at: string | null;
  delivered_at: string | null;
  content: string | null;
  whatsapp_message_id: string | null;
  status: string | null;
  created_at: string;
};

type AutoReplyLog = {
  id: string;
  decision: string;
  reason: string;
  detected_intent: string | null;
  confidence: string | null;
  needs_human: boolean | null;
  created_at: string;
};

type ConversationDetail = {
  id: string;
  status: string;
  ai_summary: string | null;
  detected_intent: string | null;
  urgency_level: string | null;
  detected_language: string | null;
  ai_suggested_status: string | null;
  human_takeover: boolean | null;
  auto_reply_enabled: boolean | null;
  last_inbound_message_type: string | null;
  contact: {
    profile_name: string | null;
    wa_id: string;
    phone: string | null;
  };
  messages: ConversationMessage[];
};

function formatField(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

function formatBoolean(value: boolean | null | undefined) {
  if (value === true) return "oui";
  if (value === false) return "non";
  return "—";
}

function SidebarRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-white/10 py-2 last:border-b-0">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <span className="max-w-[170px] text-right text-sm leading-5 text-slate-950 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function AutoReplyLogCard({ log }: { log: AutoReplyLog }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-950 dark:text-white">{log.decision}</div>
        <div className="text-[11px] text-slate-600 dark:text-slate-400">
          {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(log.created_at))}
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-400">
        <div>
          <span className="text-slate-600 dark:text-slate-400">Raison :</span> {formatField(log.reason)}
        </div>
        <div>
          <span className="text-slate-600 dark:text-slate-400">Intention :</span>{" "}
          {formatField(log.detected_intent)}
        </div>
        <div>
          <span className="text-slate-600 dark:text-slate-400">Confidence :</span>{" "}
          {formatField(log.confidence)}
        </div>
        <div>
          <span className="text-slate-600 dark:text-slate-400">Needs human :</span>{" "}
          {formatBoolean(log.needs_human)}
        </div>
      </div>
    </div>
  );
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const conversationResult = await db.query(
    `
    select
      conversations.id,
      conversations.status,
      conversations.ai_summary,
      conversations.detected_intent,
      conversations.urgency_level,
      conversations.detected_language,
      conversations.ai_suggested_status,
      conversations.human_takeover,
      conversations.auto_reply_enabled,
      latest_inbound.last_inbound_message_type,
      contacts.profile_name,
      contacts.wa_id,
      contacts.phone
    from conversations
    inner join contacts on contacts.id = conversations.contact_id
    left join lateral (
      select messages.message_type as last_inbound_message_type
      from messages
      where messages.conversation_id = conversations.id
        and messages.direction = 'inbound'
      order by messages.created_at desc
      limit 1
    ) latest_inbound on true
    where conversations.id = $1
    limit 1
    `,
    [id]
  );

  const conversationRow = conversationResult.rows[0];

  if (!conversationRow) {
    notFound();
  }

  const messagesResult = await db.query(
    `
    select
      id,
      direction,
      message_type,
      sender_type,
      media_id,
      media_url,
      media_mime_type,
      media_filename,
      media_size,
      source_label,
      delivery_status,
      read_at,
      delivered_at,
      content,
      whatsapp_message_id,
      status,
      created_at
    from messages
    where conversation_id = $1
    order by created_at asc
    `,
    [id]
  );

  const autoReplyLogsResult = await db.query(
    `
    select
      id,
      decision,
      reason,
      detected_intent,
      confidence,
      needs_human,
      created_at
    from auto_reply_logs
    where conversation_id = $1
    order by created_at desc
    limit 10
    `,
    [id]
  );

  const conversation: ConversationDetail = {
    id: conversationRow.id,
    status: conversationRow.status,
    ai_summary: conversationRow.ai_summary,
    detected_intent: conversationRow.detected_intent,
    urgency_level: conversationRow.urgency_level,
    detected_language: conversationRow.detected_language,
    ai_suggested_status: conversationRow.ai_suggested_status,
    human_takeover: conversationRow.human_takeover,
    auto_reply_enabled: conversationRow.auto_reply_enabled,
    last_inbound_message_type: conversationRow.last_inbound_message_type,
    contact: {
      profile_name: conversationRow.profile_name,
      wa_id: conversationRow.wa_id,
      phone: conversationRow.phone,
    },
    messages: messagesResult.rows,
  };

  const autoReplyLogs: AutoReplyLog[] = autoReplyLogsResult.rows;
  const autoReplyEnabled = conversation.auto_reply_enabled !== false;
  const mediaReviewLabel = getMediaReviewLabel(
    conversation.last_inbound_message_type
  );
  const isMediaReceived = isNonTextMediaMessageType(
    conversation.last_inbound_message_type
  );

  return (
    <main className="h-screen overflow-hidden bg-[var(--app-bg)] text-slate-950 dark:text-white">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-slate-200 dark:border-white/10 bg-[var(--app-header)] px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur-md sm:px-6">
          <div className="flex h-14 items-center gap-3 sm:h-16">
            <GlassIconButton
              href="/conversations"
              src="/icons/actions/button-back.png"
              alt="Retour"
              ariaLabel="Retour aux conversations"
              title="Retour"
              size="md"
              imgClassName="h-full w-full object-contain scale-[1.03]"
            />

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-semibold text-slate-950 dark:text-white sm:text-base">
                  {conversation.contact.profile_name ?? "Contact inconnu"}
                </div>
                <span className="hidden h-1 w-1 rounded-full bg-[var(--app-muted)] sm:inline-block" />
                <div className="hidden min-w-0 truncate text-xs text-slate-600 dark:text-slate-400 sm:block">
                  {conversation.contact.phone ?? conversation.contact.wa_id}
                </div>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 sm:hidden">
                <span className="truncate">
                  {formatField(conversation.status)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DashboardQuickLink compact />
              <ThemeToggle />
              <div className="hidden items-center gap-2 text-xs text-slate-600 dark:text-slate-400 sm:flex">
                <span className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-2.5 py-1">
                  {conversation.messages.length} messages
                </span>
                {autoReplyEnabled ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                    Auto-réponse active
                  </span>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                    Auto-réponse désactivée
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
                              <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-r border-[color:var(--app-border)] bg-[var(--app-sidebar)] text-[var(--app-fg)] dark:!border-white/10 dark:!bg-[#050509] dark:!text-slate-100 px-4 py-4 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin] lg:block xl:w-[320px]">
            <div className="space-y-3">
              <section className="rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm dark:!border-white/10 dark:!bg-white/[0.04] dark:shadow-none">
                <div className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-slate-700 dark:text-slate-200">
                  Lead
                </div>
                <div className="space-y-1">
                  <div className="text-base font-semibold text-slate-950 dark:text-white">
                    {conversation.contact.profile_name ?? "Contact inconnu"}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {conversation.contact.phone ?? conversation.contact.wa_id}
                  </div>
                  <div
                    className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      autoReplyEnabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                        : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
                    }`}
                  >
                    {autoReplyEnabled ? "Auto-réponse active" : "Auto-réponse désactivée"}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm dark:!border-white/10 dark:!bg-white/[0.04] dark:shadow-none">
                <div className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-slate-700 dark:text-slate-200">
                  Statut
                </div>
                <div className="rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] p-3 dark:!border-white/10 dark:!bg-slate-900">
                  <LeadStatusSelect conversationId={conversation.id} currentStatus={conversation.status} />
                </div>
              </section>

              <section className="rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm dark:!border-white/10 dark:!bg-white/[0.04] dark:shadow-none">
                <div className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-slate-700 dark:text-slate-200">
                  Qualification
                </div>
                <div className="divide-y divide-[color:var(--app-border)] rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 dark:divide-white/10 dark:!border-white/10 dark:!bg-white/[0.03]">
                  <SidebarRow label="Urgence" value={formatField(conversation.urgency_level ?? "normal")} />
                  <SidebarRow label="Langue" value={formatField(conversation.detected_language)} />
                  <SidebarRow label="Intention" value={formatField(conversation.detected_intent)} />
                  <SidebarRow label="Statut IA" value={formatField(conversation.ai_suggested_status)} />
                </div>
              </section>

              <section className="rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm dark:!border-white/10 dark:!bg-white/[0.04] dark:shadow-none">
                <div className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-slate-700 dark:text-slate-200">
                  Résumé IA
                </div>
                <ConversationSummaryCard conversationId={conversation.id} initialSummary={conversation.ai_summary} embedded showHeader={false} />
              </section>

              {isMediaReceived && mediaReviewLabel ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-950 dark:border-amber-400/20 dark:bg-[var(--app-warning-bg)] dark:text-slate-100">
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-amber-700 dark:text-amber-200">
                    Média reçu
                  </div>
                  <div className="mt-1 leading-6">{mediaReviewLabel}</div>
                </section>
              ) : null}

              <details className="rounded-xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm dark:!border-white/10 dark:!bg-white/[0.04] dark:shadow-none">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Décisions IA récentes
                </summary>
                <div className="mt-3 space-y-2">
                  {autoReplyLogs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[color:var(--app-border)] px-3 py-4 text-sm text-slate-600 dark:border-white/10 dark:text-slate-400">
                      Aucune décision auto-réponse pour le moment.
                    </div>
                  ) : (
                    autoReplyLogs.map((log) => <AutoReplyLogCard key={log.id} log={log} />)
                  )}
                </div>
              </details>
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-3 dark:!border-white/10 dark:!bg-white/[0.04] lg:hidden">
              <details className="rounded-xl border border-[color:var(--app-border)] dark:!border-white/10 bg-[var(--app-panel-soft)] dark:!bg-white/[0.03] px-3 py-2">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-950 dark:text-white">
                  Contexte lead
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-[color:var(--app-border)] dark:!border-white/10 bg-[var(--app-panel)] dark:!bg-white/[0.04] p-3">
                    <LeadStatusSelect
                      conversationId={conversation.id}
                      currentStatus={conversation.status}
                    />
                  </div>
                  <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                    {autoReplyEnabled
                      ? "Auto-réponse active"
                      : "Auto-réponse désactivée"}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div className="rounded-xl border border-[color:var(--app-border)] dark:!border-white/10 bg-[var(--app-panel-soft)] dark:!bg-white/[0.03] px-3 py-2">
                      <div className="uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Urgence</div>
                      <div className="mt-1 text-slate-950 dark:text-white">
                        {formatField(conversation.urgency_level ?? "normal")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[color:var(--app-border)] dark:!border-white/10 bg-[var(--app-panel-soft)] dark:!bg-white/[0.03] px-3 py-2">
                      <div className="uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Langue</div>
                      <div className="mt-1 text-slate-950 dark:text-white">
                        {formatField(conversation.detected_language)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[color:var(--app-border)] dark:!border-white/10 bg-[var(--app-panel-soft)] dark:!bg-white/[0.03] px-3 py-2 text-sm">
                    <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-700 dark:text-slate-200">
                      Résumé IA
                    </div>
                    <div className="mt-2">
                      <ConversationSummaryCard
                        conversationId={conversation.id}
                        initialSummary={conversation.ai_summary}
                        embedded
                        showHeader={false}
                      />
                    </div>
                  </div>
                  <details className="rounded-xl border border-[color:var(--app-border)] dark:!border-white/10 bg-[var(--app-panel-soft)] dark:!bg-white/[0.03] px-3 py-2">
                    <summary className="cursor-pointer list-none text-sm text-slate-950 dark:text-white">
                      Décisions IA récentes
                    </summary>
                    <div className="mt-3 space-y-2">
                      {autoReplyLogs.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[color:var(--app-border)] dark:border-white/10 px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                          Aucune décision auto-réponse pour le moment.
                        </div>
                      ) : (
                        autoReplyLogs.map((log) => (
                          <AutoReplyLogCard key={log.id} log={log} />
                        ))
                      )}
                    </div>
                  </details>
                </div>
              </details>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <ConversationMessages
                conversationId={conversation.id}
                initialMessages={conversation.messages}
              />
            </div>

            <footer className="pointer-events-none shrink-0 bg-transparent px-3 pb-3 sm:px-6 sm:pb-4">
              <div className="pointer-events-auto mx-auto w-full max-w-[920px]">
                <ManualReplyForm
                  conversationId={conversation.id}
                  autoReplyEnabled={autoReplyEnabled}
                />
              </div>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}


import Link from "next/link";
import { notFound } from "next/navigation";
import AiSummaryBox from "@/components/AiSummaryBox";
import ConversationMessages from "@/components/ConversationMessages";
import LeadStatusSelect from "@/components/LeadStatusSelect";
import ManualReplyForm from "@/components/ManualReplyForm";
import { getAiSettings } from "@/lib/ai-settings";
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
  last_inbound_message_type: string | null;
  contact: {
    profile_name: string | null;
    wa_id: string;
    phone: string | null;
  };
  messages: ConversationMessage[];
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <span className="text-right text-sm text-slate-100">{value}</span>
    </div>
  );
}

function AutoReplyLogCard({ log }: { log: AutoReplyLog }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">{log.decision}</div>
        <div className="text-[11px] text-slate-500">{formatDateTime(log.created_at)}</div>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-slate-300">
        <div>
          <span className="text-slate-500">Raison :</span> {formatField(log.reason)}
        </div>
        <div>
          <span className="text-slate-500">Intention :</span>{" "}
          {formatField(log.detected_intent)}
        </div>
        <div>
          <span className="text-slate-500">Confidence :</span>{" "}
          {formatField(log.confidence)}
        </div>
        <div>
          <span className="text-slate-500">Needs human :</span>{" "}
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
      source_label,
      delivery_status,
      read_at,
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
    last_inbound_message_type: conversationRow.last_inbound_message_type,
    contact: {
      profile_name: conversationRow.profile_name,
      wa_id: conversationRow.wa_id,
      phone: conversationRow.phone,
    },
    messages: messagesResult.rows,
  };

  const autoReplyLogs: AutoReplyLog[] = autoReplyLogsResult.rows;
  const aiSettings = await getAiSettings();
  const limitedAutoReplyActive =
    aiSettings.mode === "limited_auto_reply" && aiSettings.auto_reply_enabled;
  const mediaReviewLabel = getMediaReviewLabel(
    conversation.last_inbound_message_type
  );
  const isMediaReceived = isNonTextMediaMessageType(
    conversation.last_inbound_message_type
  );

  return (
    <main className="h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-white/10 bg-slate-950/95 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Link
              href="/conversations"
              className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Retour
            </Link>
            {limitedAutoReplyActive ? (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                Auto-réponse active
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                Auto-réponse en pause
              </span>
            )}
          </div>

          <div className="space-y-4 overflow-y-auto pr-1">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">
                Dossier conversation
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {conversation.contact.profile_name ?? "Contact inconnu"}
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                {conversation.contact.phone ?? conversation.contact.wa_id}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <SidebarRow
                label="Statut"
                value={
                  <LeadStatusSelect
                    conversationId={conversation.id}
                    currentStatus={conversation.status}
                  />
                }
              />
              <SidebarRow
                label="Urgence"
                value={formatField(conversation.urgency_level ?? "normal")}
              />
              <SidebarRow
                label="Langue"
                value={formatField(conversation.detected_language)}
              />
              <SidebarRow
                label="Intention"
                value={formatField(conversation.detected_intent)}
              />
              <SidebarRow
                label="Statut IA"
                value={formatField(conversation.ai_suggested_status)}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Résumé IA
              </div>
              <AiSummaryBox
                conversationId={conversation.id}
                initialSummary={conversation.ai_summary}
              />
            </div>

            {isMediaReceived && mediaReviewLabel ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50">
                <div className="text-[11px] uppercase tracking-[0.18em] text-amber-200/80">
                  Média reçu
                </div>
                <div className="mt-1">{mediaReviewLabel}</div>
              </div>
            ) : null}

            <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-white">
                Décisions IA récentes
              </summary>
              <div className="mt-3 space-y-2">
                {autoReplyLogs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-400">
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
        </aside>

        <main className="flex h-full min-h-0 flex-col">
          <header className="shrink-0 border-b border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {conversation.contact.profile_name ?? "Contact inconnu"}
                </h2>
                <p className="text-sm text-slate-400">
                  {conversation.contact.phone ?? conversation.contact.wa_id}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <div>{formatField(conversation.status)}</div>
                <div>{conversation.messages.length} messages</div>
              </div>
            </div>
          </header>

          <section className="relative flex-1 min-h-0 overflow-hidden">
            <ConversationMessages messages={conversation.messages} />
          </section>

          <footer className="shrink-0 border-t border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur">
            <ManualReplyForm conversationId={conversation.id} />
          </footer>
        </main>
      </div>
    </main>
  );
}

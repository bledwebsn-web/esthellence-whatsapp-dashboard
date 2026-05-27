import Link from "next/link";
import { notFound } from "next/navigation";
import AiSummaryBox from "@/components/AiSummaryBox";
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
  if (value === true) {
    return "oui";
  }

  if (value === false) {
    return "non";
  }

  return "—";
}

function resolveMessageParty(message: ConversationMessage) {
  const sourceLabel = (message.source_label ?? "").trim();
  const senderType = (message.sender_type ?? "").trim().toLowerCase();

  if (sourceLabel === "WABAssist") {
    return "ai";
  }

  if (senderType === "ai" || senderType === "human" || senderType === "lead") {
    return senderType;
  }

  if (message.direction === "inbound") {
    return "lead";
  }

  return "human";
}

function getWhatsappTickLabel(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "delivered") {
    return "✓✓";
  }

  if (normalized === "read") {
    return "✓✓";
  }

  if (normalized === "failed") {
    return "échec";
  }

  if (normalized === "sent") {
    return "✓";
  }

  return "✓";
}

function getWhatsappTickClass(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "read") {
    return "text-cyan-300";
  }

  if (normalized === "failed") {
    return "text-rose-300";
  }

  return "text-slate-400";
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === "inbound";
  const isAiMessage = resolveMessageParty(message) === "ai";
  const whatsappStatus = message.delivery_status ?? message.status;

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-lg ${
          isInbound
            ? "bg-slate-800 text-slate-100"
            : "bg-cyan-500 text-slate-950"
        }`}
      >
        <div className="whitespace-pre-wrap text-sm leading-6">
          {message.content || "Message sans contenu"}
        </div>
        <div
          className={`mt-2 flex items-center justify-end gap-2 text-xs ${
            isInbound ? "text-slate-400" : "text-cyan-950/70"
          }`}
        >
          {isInbound ? (
            <span>{formatDateTime(message.created_at)}</span>
          ) : (
            <>
              {isAiMessage ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-100">
                  <img
                    src="/wabassist-badge.png"
                    alt="WABAssist"
                    className="h-4 w-4 rounded-full"
                  />
                  <span>WABAssist</span>
                </span>
              ) : null}
              <span>{formatDateTime(message.created_at)}</span>
              <span
                className={`font-medium ${getWhatsappTickClass(whatsappStatus)}`}
              >
                {getWhatsappTickLabel(whatsappStatus)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AutoReplyLogCard({ log }: { log: AutoReplyLog }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{log.decision}</div>
        <div className="text-xs text-slate-400">
          {formatDateTime(log.created_at)}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        <div>
          <span className="text-slate-400">Raison :</span> {formatField(log.reason)}
        </div>
        <div>
          <span className="text-slate-400">Intention :</span>{" "}
          {formatField(log.detected_intent)}
        </div>
        <div>
          <span className="text-slate-400">Confidence :</span>{" "}
          {formatField(log.confidence)}
        </div>
        <div>
          <span className="text-slate-400">Needs human :</span>{" "}
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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/conversations"
            className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Retour
          </Link>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
                Dossier conversation
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                {conversation.contact.profile_name ?? "Contact inconnu"}
              </h1>
              <p className="mt-2 text-sm text-slate-300">
                {conversation.contact.phone ?? conversation.contact.wa_id}
              </p>
              {limitedAutoReplyActive ? (
                <div className="mt-3 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  Mode auto-réponse limitée actif
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Statut
                  </div>
                  <div className="mt-2">
                    <LeadStatusSelect
                      conversationId={conversation.id}
                      currentStatus={conversation.status}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Urgence
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {formatField(conversation.urgency_level ?? "normal")}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Langue détectée
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {formatField(conversation.detected_language)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Intention détectée
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {formatField(conversation.detected_intent)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Statut suggéré IA
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {formatField(conversation.ai_suggested_status)}
                  </div>
                </div>
                {isMediaReceived && mediaReviewLabel ? (
                  <div className="sm:col-span-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-amber-200/80">
                      Média reçu
                    </div>
                    <div className="mt-2 text-sm font-medium text-amber-50">
                      {mediaReviewLabel}
                    </div>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <AiSummaryBox
                    conversationId={conversation.id}
                    initialSummary={conversation.ai_summary}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-4 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Historique des messages
                </h2>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-400/20">
                  {conversation.messages.length} messages
                </span>
              </div>

              <div className="space-y-4">
                {conversation.messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">
                    Aucun message dans cette conversation.
                  </div>
                ) : (
                  conversation.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))
                )}
              </div>

              <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/60 p-4 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Décisions auto-réponse IA
                  </h2>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-inset ring-white/10">
                    {autoReplyLogs.length} logs
                  </span>
                </div>

                <div className="space-y-3">
                  {autoReplyLogs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                      Aucune décision auto-réponse pour le moment.
                    </div>
                  ) : (
                    autoReplyLogs.map((log) => (
                      <AutoReplyLogCard key={log.id} log={log} />
                    ))
                  )}
                </div>
              </div>

              <ManualReplyForm conversationId={conversation.id} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

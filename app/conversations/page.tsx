import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { getIntentDisplayLabel } from "@/lib/analyze-conversation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Conversation = {
  conversation_id: string;
  status: string;
  ai_suggested_status: string | null;
  detected_intent: string | null;
  detected_language: string | null;
  last_inbound_message_type: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  profile_name: string | null;
  wa_id: string;
  phone: string | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ConversationsPage() {
  const result = await db.query(
    `
    select
      conversations.id as conversation_id,
      conversations.status,
      conversations.ai_suggested_status,
      conversations.detected_intent,
      conversations.detected_language,
      latest_inbound.last_inbound_message_type,
      conversations.last_message_preview,
      conversations.last_message_at,
      conversations.created_at,
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
    order by conversations.last_message_at desc nulls last,
             conversations.created_at desc
    `
  );

  const conversations = result.rows as Conversation[];

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
                Esthellence WhatsApp
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--app-fg)] sm:text-4xl">
                Conversations WhatsApp
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--app-muted)] sm:text-base">
                Leads reçus depuis la campagne WhatsApp Ads Esthellence
              </p>
            </div>

            <div className="flex items-center gap-2 sm:self-start">
              <ThemeToggle />
              <a
                href="/api/export/leads.csv"
                download="esthellence-leads.csv"
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition hover:bg-[var(--app-panel-strong)]"
              >
                Exporter CSV
              </a>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-panel)] shadow-2xl shadow-cyan-950/20">
          {conversations.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-[var(--app-muted)]">
              Aucune conversation pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[color:var(--app-border)]">
                <thead className="bg-[var(--app-panel-soft)]">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                    <th className="px-6 py-4">Nom</th>
                    <th className="px-6 py-4">Numéro WhatsApp</th>
                    <th className="px-6 py-4">Dernier message</th>
                    <th className="px-6 py-4">Statut</th>
                    <th className="px-6 py-4">Statut IA</th>
                    <th className="px-6 py-4">Langue</th>
                    <th className="px-6 py-4">Intention</th>
                    <th className="px-6 py-4">Dernière activité</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--app-border)]">
                  {conversations.map((conversation) => (
                    <tr
                      key={conversation.conversation_id}
                      className="transition-colors hover:bg-black/5"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-[var(--app-fg)]">
                          {conversation.profile_name ?? "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--app-muted)]">
                        {conversation.phone ?? conversation.wa_id}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--app-muted)]">
                        <div className="max-w-md truncate">
                          {conversation.last_message_preview ?? "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-400/20">
                          {conversation.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--app-muted)]">
                        {conversation.ai_suggested_status ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--app-muted)]">
                        {conversation.detected_language ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--app-muted)]">
                        {getIntentDisplayLabel(
                          conversation.detected_intent,
                          conversation.last_inbound_message_type
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--app-muted)]">
                        {formatDate(
                          conversation.last_message_at ?? conversation.created_at
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/conversations/${conversation.conversation_id}`}
                          className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20 hover:text-white"
                        >
                          Ouvrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

import DashboardQuickLink from "@/components/DashboardQuickLink";
import ConversationsInbox from "@/components/ConversationsInbox";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ConversationRow = {
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

export default async function ConversationsPage() {
  const result = await db.query(
    `
    select
      conversations.id as conversation_id,
      contacts.profile_name as whatsapp_name,
      contacts.wa_id as whatsapp_number,
      conversations.status,
      conversations.urgency_level,
      conversations.detected_intent,
      conversations.detected_language,
      conversations.ai_summary,
      conversations.ai_suggested_status,
      coalesce(conversations.auto_reply_enabled, true) as auto_reply_enabled,
      coalesce(conversations.human_takeover, false) as needs_human,
      conversations.created_at,
      coalesce(conversations.last_message_preview, latest_message.content) as last_message,
      coalesce(conversations.last_message_at, latest_message.created_at, conversations.created_at) as last_message_at,
      latest_message.message_type as last_message_type,
      latest_message.direction as last_direction,
      latest_inbound.last_inbound_at,
      latest_outbound.last_outbound_at,
      message_count.total as message_count
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
      select messages.created_at as last_inbound_at
      from messages
      where messages.conversation_id = conversations.id
        and messages.direction = 'inbound'
      order by messages.created_at desc
      limit 1
    ) latest_inbound on true
    left join lateral (
      select messages.created_at as last_outbound_at
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

  const conversations = result.rows as ConversationRow[];

  return (
    <div className="bg-[var(--app-bg)] text-[color:var(--app-fg)]">
      <div className="mx-auto max-w-7xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 lg:px-8">
        <div className="flex justify-end">
          <DashboardQuickLink compact />
        </div>
      </div>
      <ConversationsInbox conversations={conversations} />
    </div>
  );
}

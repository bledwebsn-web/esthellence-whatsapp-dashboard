import { db } from "@/lib/db";

type ConversationRow = {
  conversation_id: string;
  status: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
  profile_name: string | null;
  wa_id: string;
  phone: string | null;
};

export async function GET() {
  try {
    const result = await db.query<ConversationRow>(
      `
      select
        conv.id as conversation_id,
        conv.status,
        conv.last_message_preview,
        conv.last_message_at,
        conv.created_at,
        c.profile_name,
        c.wa_id,
        c.phone
      from conversations conv
      inner join contacts c on c.id = conv.contact_id
      order by conv.last_message_at desc nulls last, conv.created_at desc
      `
    );

    return Response.json({ conversations: result.rows });
  } catch (error) {
    console.error("Failed to fetch conversations:", error);

    return Response.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.query(`
      select
        conversations.id as conversation_id,
        conversations.status,
        conversations.last_message_preview,
        conversations.last_message_at,
        conversations.created_at,
        contacts.profile_name,
        contacts.wa_id,
        contacts.phone
      from conversations
      join contacts on contacts.id = conversations.contact_id
      order by conversations.last_message_at desc nulls last,
               conversations.created_at desc
    `);

    return Response.json({
      conversations: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch conversations:", error);

    return Response.json(
      {
        error: "Failed to fetch conversations",
      },
      { status: 500 }
    );
  }
}

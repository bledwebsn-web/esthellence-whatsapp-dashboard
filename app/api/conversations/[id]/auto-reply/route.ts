function parseBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

async function getDb() {
  const { db } = await import("@/lib/db");
  return db;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();

    const result = await db.query(
      `
      select
        id,
        coalesce(auto_reply_enabled, true) as auto_reply_enabled
      from conversations
      where id = $1
      limit 1
      `,
      [id]
    );

    const conversation = result.rows[0];

    if (!conversation) {
      return Response.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      auto_reply_enabled: Boolean(conversation.auto_reply_enabled),
    });
  } catch (error) {
    console.error("Failed to read conversation auto-reply state:", error);

    return Response.json(
      { success: false, error: "Failed to read conversation auto-reply state" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();
    const body = (await request.json()) as { auto_reply_enabled?: unknown };
    const autoReplyEnabled = parseBoolean(body.auto_reply_enabled);

    if (autoReplyEnabled === null) {
      return Response.json(
        { success: false, error: "Invalid auto_reply_enabled" },
        { status: 400 }
      );
    }

    const result = await db.query(
      `
      update conversations
      set auto_reply_enabled = $1
      where id = $2
      returning id, coalesce(auto_reply_enabled, true) as auto_reply_enabled
      `,
      [autoReplyEnabled, id]
    );

    const updated = result.rows[0];

    if (!updated) {
      return Response.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      auto_reply_enabled: Boolean(updated.auto_reply_enabled),
    });
  } catch (error) {
    console.error("Failed to update conversation auto-reply state:", error);

    return Response.json(
      { success: false, error: "Failed to update conversation auto-reply state" },
      { status: 500 }
    );
  }
}

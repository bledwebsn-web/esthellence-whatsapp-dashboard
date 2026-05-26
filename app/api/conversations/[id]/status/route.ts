import { db } from "@/lib/db";

const ALLOWED_STATUSES = [
  "nouveau",
  "en_cours",
  "qualifié",
  "rdv",
  "à_rappeler",
  "perdu",
  "spam",
] as const;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(status: unknown): status is AllowedStatus {
  return typeof status === "string" && ALLOWED_STATUSES.includes(status as AllowedStatus);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: unknown };

    if (!isAllowedStatus(body.status)) {
      return Response.json(
        { success: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    const result = await db.query(
      `
      update conversations
      set status = $1
      where id = $2
      returning id, status
      `,
      [body.status, id]
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
      status: updated.status,
    });
  } catch (error) {
    console.error("Failed to update status:", error);

    return Response.json(
      { success: false, error: "Failed to update status" },
      { status: 500 }
    );
  }
}

import {
  ensureProductConfigTables,
  mapGenerationRunRow,
  type KbGenerationRunRow,
} from "../../_product-config";
import { db } from "@/lib/db";

function errorResponse(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureProductConfigTables();
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return errorResponse("Run introuvable.", 400);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (Object.prototype.hasOwnProperty.call(body, "generated_items")) {
      fields.push(`generated_items = ${add(JSON.stringify(body.generated_items ?? []))}::jsonb`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      fields.push(`status = ${add(String(body.status ?? "draft").trim() || "draft")}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "error_message")) {
      fields.push(`error_message = ${add(String(body.error_message ?? "").trim() || null)}`);
    }

    if (!fields.length) {
      return errorResponse("Aucune modification à enregistrer.", 400);
    }

    fields.push(`updated_at = now()`);
    const idPlaceholder = add(id);

    const updated = await db.query<KbGenerationRunRow>(
      `
      update kb_generation_runs
      set ${fields.join(", ")}
      where id = ${idPlaceholder}
      returning
        id,
        client_id,
        source_id,
        profile_config_id,
        status,
        generated_items,
        raw_ai_response,
        error_message,
        created_at,
        updated_at
      `,
      values
    );

    if (!updated.rows[0]) {
      return errorResponse("Run introuvable.", 404);
    }

    return Response.json({
      success: true,
      run: mapGenerationRunRow(updated.rows[0]),
    });
  } catch (error) {
    console.error("Failed to update KB generation run:", error);
    return Response.json({ success: false, error: "Failed to update generation run" }, { status: 500 });
  }
}

import {
  ensureProductConfigTables,
  mapProfileRow,
  resolveClientId,
  type SalesProfileRow,
} from "../../_product-config";
import { db } from "@/lib/db";

function errorResponse(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : Boolean(value);
}

async function clearOtherDefaults(clientId: string | null, currentId: string) {
  if (clientId !== null) {
    await db.query(
      `
      update sales_profile_configs
      set is_default = false,
          updated_at = now()
      where id <> $1
        and (client_id = $2::uuid or client_id is null)
      `,
      [currentId, clientId]
    );
  } else {
    await db.query(
      `
      update sales_profile_configs
      set is_default = false,
          updated_at = now()
      where id <> $1
        and client_id is null
      `,
      [currentId]
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureProductConfigTables();
    const clientId = await resolveClientId();
    const { id } = await params;
    const body = await request.json();
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (!id) {
      return errorResponse("Impossible de mettre à jour le profil commercial.", 400);
    }

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const nextName = normalizeString(body.name);
      if (!nextName) {
        return errorResponse("Le nom du profil est requis.", 400);
      }
      fields.push(`name = ${add(nextName)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "product_type")) {
      const nextProductType = normalizeString(body.product_type);
      if (!nextProductType) {
        return errorResponse("Le type de produit est requis.", 400);
      }
      fields.push(`product_type = ${add(nextProductType)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "tone")) {
      fields.push(`tone = ${add(normalizeString(body.tone) || "professionnel, clair et rassurant")}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "target_audience")) {
      fields.push(`target_audience = ${add(normalizeString(body.target_audience) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "main_goal")) {
      fields.push(`main_goal = ${add(normalizeString(body.main_goal) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "cta_type")) {
      fields.push(`cta_type = ${add(normalizeString(body.cta_type) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "qualification_questions")) {
      fields.push(`qualification_questions = ${add(normalizeString(body.qualification_questions) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "constraints")) {
      fields.push(`constraints = ${add(normalizeString(body.constraints) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "is_default")) {
      fields.push(`is_default = ${add(normalizeBoolean(body.is_default))}`);
    }

    if (!fields.length) {
      return errorResponse("Aucune modification à enregistrer.", 400);
    }

    fields.push(`updated_at = now()`);
    const idPlaceholder = add(id);
    const clientPlaceholder = clientId !== null ? add(clientId) : null;
    const whereClause =
      clientPlaceholder !== null
        ? `id = ${idPlaceholder} and (client_id = ${clientPlaceholder}::uuid or client_id is null)`
        : `id = ${idPlaceholder} and client_id is null`;

    const updated = await db.query<SalesProfileRow>(
      `
      update sales_profile_configs
      set ${fields.join(", ")}
      where ${whereClause}
      returning
        id,
        client_id,
        name,
        product_type,
        tone,
        target_audience,
        main_goal,
        cta_type,
        qualification_questions,
        constraints,
        is_default,
        created_at,
        updated_at
      `,
      values
    );

    const row = updated.rows[0] ?? null;
    if (!row) {
      return errorResponse("Impossible de mettre à jour le profil commercial.", 404);
    }

    if (row.is_default) {
      await clearOtherDefaults(clientId, row.id);
    }

    return Response.json({
      success: true,
      item: mapProfileRow(row),
    });
  } catch (error) {
    console.error("Failed to update sales profile:", error);
    return Response.json({ success: false, error: "Failed to update sales profile" }, { status: 500 });
  }
}

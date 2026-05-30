import {
  ensureProductConfigTables,
  mapSourceRow,
  PRODUCT_SOURCE_STATUSES,
  PRODUCT_SOURCE_TYPES,
  resolveClientId,
  type ProductSourceRow,
} from "../../_product-config";
import { db } from "@/lib/db";

function errorResponse(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function isValidSourceType(value: string) {
  return PRODUCT_SOURCE_TYPES.has(value);
}

function isValidSourceStatus(value: string) {
  return PRODUCT_SOURCE_STATUSES.has(value);
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
      return errorResponse("Impossible de mettre à jour la source produit.", 400);
    }

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const nextTitle = normalizeString(body.title);
      if (!nextTitle) {
        return errorResponse("Le titre de la source est requis.", 400);
      }
      fields.push(`title = ${add(nextTitle)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "source_type")) {
      const nextSourceType = normalizeString(body.source_type) || "text";
      if (!isValidSourceType(nextSourceType)) {
        return errorResponse("Le type de source est invalide.", 400);
      }
      fields.push(`source_type = ${add(nextSourceType)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "source_url")) {
      fields.push(`source_url = ${add(normalizeString(body.source_url) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "file_name")) {
      fields.push(`file_name = ${add(normalizeString(body.file_name) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "file_mime_type")) {
      fields.push(`file_mime_type = ${add(normalizeString(body.file_mime_type) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "file_size")) {
      const nextFileSize = Number(body.file_size);
      fields.push(`file_size = ${add(Number.isFinite(nextFileSize) ? Math.max(0, Math.trunc(nextFileSize)) : null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "raw_text")) {
      fields.push(`raw_text = ${add(normalizeString(body.raw_text) || null)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const nextStatus = normalizeString(body.status) || "draft";
      if (!isValidSourceStatus(nextStatus)) {
        return errorResponse("Le statut de la source est invalide.", 400);
      }
      fields.push(`status = ${add(nextStatus)}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "extraction_status")) {
      fields.push(`extraction_status = ${add(normalizeString(body.extraction_status) || "none")}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "extraction_error")) {
      fields.push(`extraction_error = ${add(normalizeString(body.extraction_error) || null)}`);
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

    const updated = await db.query<ProductSourceRow>(
      `
      update product_sources
      set ${fields.join(", ")}
      where ${whereClause}
      returning
        id,
        client_id,
        title,
        source_type,
        source_url,
        file_url,
        file_name,
        file_mime_type,
        file_size,
        raw_text,
        status,
        extraction_status,
        extraction_error,
        created_at,
        updated_at
      `,
      values
    );

    if (!updated.rows[0]) {
      return errorResponse("Impossible de mettre à jour la source produit.", 404);
    }

    return Response.json({
      success: true,
      item: mapSourceRow(updated.rows[0]),
    });
  } catch (error) {
    console.error("Failed to update product source:", error);
    return Response.json({ success: false, error: "Failed to update product source" }, { status: 500 });
  }
}

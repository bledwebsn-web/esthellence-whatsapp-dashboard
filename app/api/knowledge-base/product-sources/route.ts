import {
  ensureProductConfigTables,
  mapSourceRow,
  PRODUCT_SOURCE_STATUSES,
  PRODUCT_SOURCE_TYPES,
  resolveClientId,
  type ProductSourceRow,
} from "../_product-config";
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

export async function GET() {
  try {
    await ensureProductConfigTables();
    const clientId = await resolveClientId();

    const result = await db.query<ProductSourceRow>(
      `
      select
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
      from product_sources
      where ($1::uuid is not null and (client_id = $1::uuid or client_id is null))
         or ($1::uuid is null and client_id is null)
      order by coalesce(updated_at, created_at) desc, created_at desc
      `,
      [clientId]
    );

    return Response.json({
      items: result.rows.map(mapSourceRow),
    });
  } catch (error) {
    console.error("Failed to fetch product sources:", error);
    return Response.json({ success: false, error: "Failed to fetch product sources" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureProductConfigTables();
    const clientId = await resolveClientId();
    const body = await request.json();
    const title = normalizeString(body.title);
    const sourceType = normalizeString(body.source_type) || "text";
    const sourceUrl = normalizeString(body.source_url);
    const rawText = normalizeString(body.raw_text);
    const status = normalizeString(body.status) || "draft";
    const fileName = normalizeString(body.file_name);
    const fileMimeType = normalizeString(body.file_mime_type);
    const fileSizeValue = Number(body.file_size);
    const fileSize = Number.isFinite(fileSizeValue) ? Math.max(0, Math.trunc(fileSizeValue)) : null;
    const extractionStatus = normalizeString(body.extraction_status) || "none";
    const extractionError = normalizeString(body.extraction_error);

    if (!title || !isValidSourceType(sourceType) || !isValidSourceStatus(status)) {
      return errorResponse("Impossible de créer la source produit.", 400);
    }

    if (sourceType === "url" && !sourceUrl) {
      return errorResponse("L’URL de la source est requise pour un lien.", 400);
    }

    if (sourceType === "text" && !rawText) {
      return errorResponse("Le texte produit est requis pour une source texte.", 400);
    }

    const inserted = await db.query<ProductSourceRow>(
      `
      insert into product_sources (
        client_id,
        title,
        source_type,
        source_url,
        file_name,
        file_mime_type,
        file_size,
        raw_text,
        status,
        extraction_status,
        extraction_error
      )
      values ($1, $2, $3, nullif($4, ''), nullif($5, ''), nullif($6, ''), $7, nullif($8, ''), $9, nullif($10, ''), nullif($11, ''))
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
      [
        clientId,
        title,
        sourceType,
        sourceUrl,
        fileName,
        fileMimeType,
        fileSize,
        rawText,
        status,
        extractionStatus,
        extractionError,
      ]
    );

    return Response.json({
      success: true,
      item: inserted.rows[0] ? mapSourceRow(inserted.rows[0]) : null,
    });
  } catch (error) {
    console.error("Failed to create product source:", error);
    return Response.json({ success: false, error: "Failed to create product source" }, { status: 500 });
  }
}

import { ensureProductConfigTables, mapSourceRow, resolveClientId, type ProductSourceRow } from "../../_product-config";
import { extractTextFromDocument } from "@/lib/document-text-extraction";
import { db } from "@/lib/db";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function errorResponse(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

function normalizeString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getMimeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  return "";
}

export async function POST(request: Request) {
  try {
    await ensureProductConfigTables();
    const clientId = await resolveClientId();
    const formData = await request.formData();
    const file = formData.get("file");
    const titleInput = normalizeString(formData.get("title"));

    if (!(file instanceof File)) {
      return errorResponse("Un document est requis.", 400);
    }

    if (file.size <= 0) {
      return errorResponse("Le document est vide.", 400);
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return errorResponse("Le document est trop volumineux. Limite 10 Mo.", 413);
    }

    const mimeType = file.type || getMimeFromFileName(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractTextFromDocument({
      buffer,
      fileName: file.name,
      mimeType,
    });

    const inserted = await db.query<ProductSourceRow>(
      `
      insert into product_sources (
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
        extraction_error
      )
      values (
        $1,
        $2,
        'file',
        null,
        null,
        $3,
        $4,
        $5,
        $6,
        'draft',
        $7,
        $8
      )
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
        titleInput || file.name,
        file.name,
        mimeType || null,
        file.size,
        extraction.text || null,
        extraction.status,
        extraction.error ?? null,
      ]
    );

    const source = mapSourceRow(inserted.rows[0]);

    return Response.json({
      success: true,
      source,
      warning: extraction.status === "failed" ? extraction.error : null,
    });
  } catch (error) {
    console.error("Failed to upload product source document:", error);
    return Response.json(
      { success: false, error: "Impossible d’extraire le texte du document." },
      { status: 500 }
    );
  }
}

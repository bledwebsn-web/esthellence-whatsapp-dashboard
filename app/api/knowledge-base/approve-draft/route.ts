import {
  ensureProductConfigTables,
  mapGenerationRunRow,
  resolveClientId,
  type KbGenerationRunRow,
} from "../_product-config";
import { db } from "@/lib/db";

type KnowledgeBaseRow = {
  id: string;
  title: string | null;
  category: string | null;
  question: string | null;
  answer: string | null;
  keywords: string[] | string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string | null;
};

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKeywords(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((keyword) => String(keyword).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,|]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);
  }

  return [];
}

function mapKnowledgeBaseRow(row: KnowledgeBaseRow) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    question: row.question,
    answer: row.answer,
    keywords: Array.isArray(row.keywords)
      ? row.keywords
      : typeof row.keywords === "string"
        ? normalizeKeywords(row.keywords)
        : [],
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function POST(request: Request) {
  const connection = await db.connect();

  try {
    await ensureProductConfigTables();
    const clientId = await resolveClientId();
    const body = await request.json();
    const runId = normalizeString(body.run_id);
    const itemIndex = Number(body.item_index);
    const payloadItem = body.item && typeof body.item === "object" ? (body.item as Record<string, unknown>) : null;
    const activate = Boolean(body.activate);

    if (!runId || !Number.isInteger(itemIndex) || itemIndex < 0) {
      return errorResponse("Impossible d’ajouter ce brouillon à la base officielle.", 400);
    }

    if (!payloadItem) {
      return errorResponse("Impossible d’ajouter ce brouillon à la base officielle.", 400);
    }

    await connection.query("begin");

    const runResult = await connection.query<KbGenerationRunRow>(
      `
      select
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
      from kb_generation_runs
      where id = $1
        and (
          ($2::uuid is not null and (client_id = $2::uuid or client_id is null))
          or ($2::uuid is null and client_id is null)
        )
      limit 1
      for update
      `,
      [runId, clientId]
    );

    const runRow = runResult.rows[0];

    if (!runRow) {
      await connection.query("rollback");
      return errorResponse("Run introuvable.", 404);
    }

    const generatedItems = Array.isArray(runRow.generated_items) ? [...runRow.generated_items] : [];
    const currentItem = generatedItems[itemIndex] && typeof generatedItems[itemIndex] === "object"
      ? (generatedItems[itemIndex] as Record<string, unknown>)
      : null;

    if (!currentItem) {
      await connection.query("rollback");
      return errorResponse("Brouillon introuvable.", 404);
    }

    if (Boolean(currentItem.approved || currentItem.knowledge_base_id)) {
      await connection.query("rollback");
      return errorResponse("Ce brouillon a déjà été validé.", 409);
    }

    const question = normalizeString(payloadItem.question);
    const answer = normalizeString(payloadItem.answer);
    const title = normalizeString(payloadItem.title) || question.slice(0, 120) || "Brouillon";
    const category = normalizeString(payloadItem.category) || "Général";
    const keywords = normalizeKeywords(payloadItem.keywords);
    const detectedIntent = normalizeString(payloadItem.detected_intent) || "unknown";

    if (!question || !answer) {
      await connection.query("rollback");
      return errorResponse("Impossible d’ajouter ce brouillon à la base officielle.", 400);
    }

    const insertedEntry = await connection.query<KnowledgeBaseRow>(
      `
      insert into knowledge_base
      (client_id, title, category, question, answer, keywords, is_active)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning
        id,
        title,
        category,
        question,
        answer,
        keywords,
        is_active,
        created_at,
        updated_at
      `,
      [clientId, title, category, question, answer, keywords, activate]
    );

    const knowledgeBaseEntry = insertedEntry.rows[0];

    if (!knowledgeBaseEntry) {
      throw new Error("knowledge_base insert failed");
    }

    const approvedAt = new Date().toISOString();
    const nextItems = generatedItems.map((item, index) => {
      if (index !== itemIndex) {
        return item;
      }

      return {
        ...item,
        title,
        category,
        question,
        answer,
        keywords,
        detected_intent: detectedIntent,
        approved: true,
        knowledge_base_id: knowledgeBaseEntry.id,
        knowledge_base_active: Boolean(knowledgeBaseEntry.is_active ?? activate),
        approved_at: approvedAt,
        needs_review: false,
      };
    });

    const allApproved = nextItems.every((item) => Boolean(item.approved || item.knowledge_base_id));
    const updatedRun = await connection.query<KbGenerationRunRow>(
      `
      update kb_generation_runs
      set generated_items = $1::jsonb,
          status = $2,
          updated_at = now()
      where id = $3
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
      [JSON.stringify(nextItems), allApproved ? "approved" : "generated", runId]
    );

    await connection.query("commit");

    return Response.json({
      success: true,
      knowledge_base_entry: mapKnowledgeBaseRow(knowledgeBaseEntry),
      run: mapGenerationRunRow(updatedRun.rows[0]),
    });
  } catch (error) {
    try {
      await connection.query("rollback");
    } catch {
      // Ignore rollback errors.
    }

    console.error("Failed to approve KB draft:", error);
    return errorResponse("Impossible d’ajouter ce brouillon à la base officielle.", 500);
  } finally {
    connection.release();
  }
}

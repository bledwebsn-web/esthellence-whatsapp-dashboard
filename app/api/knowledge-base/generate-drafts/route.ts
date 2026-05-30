import {
  ensureProductConfigTables,
  mapGenerationRunRow,
  mapProfileRow,
  mapSourceRow,
  resolveClientId,
  type KbGenerationRunRow,
  type ProductSourceRow,
  type SalesProfileRow,
} from "../_product-config";
import { db } from "@/lib/db";
import { buildKbDraftsSystemPrompt, buildKbDraftsUserPrompt } from "@/lib/ai-prompts";
import { generateGroqChatCompletion } from "@/lib/groq";

type GeneratedDraftItem = {
  title: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  detected_intent: string;
  sales_profile: string;
  confidence: "high" | "medium" | "low";
  needs_review: boolean;
  notes: string;
};

function errorResponse(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ success: false, error: message, ...extra }, { status });
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(15, Math.max(1, Math.round(parsed)));
}

function normalizeGeneratedItems(value: unknown, salesProfileName: string): GeneratedDraftItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): GeneratedDraftItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const title = normalizeString(candidate.title);
      const category = normalizeString(candidate.category);
      const question = normalizeString(candidate.question);
      const answer = normalizeString(candidate.answer);
      const keywords = Array.isArray(candidate.keywords)
        ? candidate.keywords.map((keyword) => normalizeString(keyword)).filter(Boolean)
        : [];
      const detectedIntent = normalizeString(candidate.detected_intent);
      const notes = normalizeString(candidate.notes);
      const confidence = normalizeString(candidate.confidence);

      if (!question || !answer) {
        return null;
      }

      return {
        title: title || question.slice(0, 120),
        category: category || "Général",
        question,
        answer,
        keywords,
        detected_intent: detectedIntent || "unknown",
        sales_profile: normalizeString(candidate.sales_profile) || salesProfileName,
        confidence: confidence === "low" ? "low" : confidence === "medium" ? "medium" : "high",
        needs_review: true,
        notes,
      };
    })
    .filter((item): item is GeneratedDraftItem => Boolean(item));
}

async function loadSourceAndProfile(sourceId: string, profileId: string, clientId: string | null) {
  const sourceResult = await db.query<ProductSourceRow>(
    `
    select
      id,
      client_id,
      title,
      source_type,
      source_url,
      file_url,
      raw_text,
      status,
      created_at,
      updated_at
    from product_sources
    where id = $1
      and (
        ($2::uuid is not null and (client_id = $2::uuid or client_id is null))
        or ($2::uuid is null and client_id is null)
      )
    limit 1
    `,
    [sourceId, clientId]
  );

  const profileResult = await db.query<SalesProfileRow>(
    `
    select
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
    from sales_profile_configs
    where id = $1
      and (
        ($2::uuid is not null and (client_id = $2::uuid or client_id is null))
        or ($2::uuid is null and client_id is null)
      )
    limit 1
    `,
    [profileId, clientId]
  );

  return {
    source: sourceResult.rows[0] ? mapSourceRow(sourceResult.rows[0]) : null,
    profile: profileResult.rows[0] ? mapProfileRow(profileResult.rows[0]) : null,
  };
}

async function insertGenerationRun(params: {
  clientId: string | null;
  sourceId: string | null;
  profileId: string | null;
  status: string;
  generatedItems: GeneratedDraftItem[];
  rawAiResponse: string | null;
  errorMessage: string | null;
}) {
  const inserted = await db.query<KbGenerationRunRow>(
    `
    insert into kb_generation_runs (
      client_id,
      source_id,
      profile_config_id,
      status,
      generated_items,
      raw_ai_response,
      error_message
    )
    values ($1, $2, $3, $4, $5::jsonb, $6, $7)
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
    [
      params.clientId,
      params.sourceId,
      params.profileId,
      params.status,
      JSON.stringify(params.generatedItems),
      params.rawAiResponse,
      params.errorMessage,
    ]
  );

  return inserted.rows[0] ? mapGenerationRunRow(inserted.rows[0]) : null;
}

export async function POST(request: Request) {
  let runId: string | null = null;
  let sourceId: string | null = null;
  let profileId: string | null = null;
  let clientId: string | null = null;
  let rawAiResponse: string | null = null;

  try {
    await ensureProductConfigTables();
    clientId = await resolveClientId();
    const body = await request.json();
    sourceId = normalizeString(body.source_id);
    profileId = normalizeString(body.profile_config_id);
    const count = normalizeCount(body.count);

    if (!sourceId || !profileId) {
      return errorResponse("La source produit et le profil commercial sont obligatoires.", 400);
    }

    const { source, profile } = await loadSourceAndProfile(sourceId, profileId, clientId);

    if (!source) {
      return errorResponse("Source produit introuvable.", 404);
    }

    if (!profile) {
      return errorResponse("Profil commercial introuvable.", 404);
    }

    const systemPrompt = buildKbDraftsSystemPrompt();
    const userPrompt = buildKbDraftsUserPrompt({
      source: {
        title: source.title,
        source_type: source.source_type,
        source_url: source.source_url,
        raw_text: source.raw_text,
      },
      profile: {
        name: profile.name,
        product_type: profile.product_type,
        tone: profile.tone,
        target_audience: profile.target_audience,
        main_goal: profile.main_goal,
        cta_type: profile.cta_type,
        qualification_questions: profile.qualification_questions,
        constraints: profile.constraints,
      },
      count,
    });

    rawAiResponse = await generateGroqChatCompletion({
      systemPrompt,
      userPrompt,
      model: "text",
    });

    const parsed = JSON.parse(rawAiResponse) as Record<string, unknown>;
    const items = normalizeGeneratedItems(parsed.items, profile.name).slice(0, count);

    const run = await insertGenerationRun({
      clientId,
      sourceId,
      profileId,
      status: "generated",
      generatedItems: items,
      rawAiResponse,
      errorMessage: null,
    });

    runId = run?.id ?? null;

    return Response.json({
      success: true,
      run,
    });
  } catch (error) {
    console.error("Failed to generate KB drafts:", error);

    const fallbackRun = await insertGenerationRun({
      clientId,
      sourceId,
      profileId,
      status: "draft",
      generatedItems: [],
      rawAiResponse,
      errorMessage: "Impossible de générer les brouillons pour le moment.",
    }).catch(() => null);

    const responseRunId = fallbackRun?.id ?? runId;

    return Response.json(
      {
        error: "Impossible de générer les brouillons pour le moment.",
        run_id: responseRunId,
      },
      { status: 500 }
    );
  }
}

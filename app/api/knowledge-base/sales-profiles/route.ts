import {
  ensureProductConfigTables,
  mapProfileRow,
  resolveClientId,
  type SalesProfileRow,
} from "../_product-config";
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

async function setDefaultProfile(clientId: string | null, currentId: string) {
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

export async function GET() {
  try {
    await ensureProductConfigTables();
    const clientId = await resolveClientId();

    const result = await db.query<SalesProfileRow>(
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
      where ($1::uuid is not null and (client_id = $1::uuid or client_id is null))
         or ($1::uuid is null and client_id is null)
      order by is_default desc, coalesce(updated_at, created_at) desc, created_at desc
      `,
      [clientId]
    );

    return Response.json({
      items: result.rows.map(mapProfileRow),
    });
  } catch (error) {
    console.error("Failed to fetch sales profiles:", error);
    return Response.json({ success: false, error: "Failed to fetch sales profiles" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureProductConfigTables();
    const clientId = await resolveClientId();
    const body = await request.json();
    const name = normalizeString(body.name);
    const productType = normalizeString(body.product_type);
    const tone = normalizeString(body.tone) || "professionnel, clair et rassurant";
    const targetAudience = normalizeString(body.target_audience);
    const mainGoal = normalizeString(body.main_goal);
    const ctaType = normalizeString(body.cta_type);
    const qualificationQuestions = normalizeString(body.qualification_questions);
    const constraints = normalizeString(body.constraints);
    const isDefault = normalizeBoolean(body.is_default);

    if (!name || !productType) {
      return errorResponse("Le nom du profil et le type de produit sont obligatoires.", 400);
    }

    const inserted = await db.query<SalesProfileRow>(
      `
      insert into sales_profile_configs (
        client_id,
        name,
        product_type,
        tone,
        target_audience,
        main_goal,
        cta_type,
        qualification_questions,
        constraints,
        is_default
      )
      values ($1, $2, $3, $4, nullif($5, ''), nullif($6, ''), nullif($7, ''), nullif($8, ''), nullif($9, ''), $10)
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
      [clientId, name, productType, tone, targetAudience, mainGoal, ctaType, qualificationQuestions, constraints, isDefault]
    );

    const row = inserted.rows[0] ?? null;
    if (row && row.is_default) {
      await setDefaultProfile(clientId, row.id);
    }

    return Response.json({
      success: true,
      item: row ? mapProfileRow(row) : null,
    });
  } catch (error) {
    console.error("Failed to create sales profile:", error);
    return Response.json({ success: false, error: "Failed to create sales profile" }, { status: 500 });
  }
}

import {
  ensureProductConfigTables,
  mapGenerationRunRow,
  type KbGenerationRunRow,
} from "../_product-config";
import { db } from "@/lib/db";

type GenerationRunListRow = KbGenerationRunRow & {
  source_title: string | null;
  profile_name: string | null;
};

export async function GET() {
  try {
    await ensureProductConfigTables();

    const result = await db.query<GenerationRunListRow>(
      `
      select
        runs.id,
        runs.client_id,
        runs.source_id,
        runs.profile_config_id,
        runs.status,
        runs.generated_items,
        runs.raw_ai_response,
        runs.error_message,
        runs.created_at,
        runs.updated_at,
        sources.title as source_title,
        profiles.name as profile_name
      from kb_generation_runs runs
      left join product_sources sources on sources.id = runs.source_id
      left join sales_profile_configs profiles on profiles.id = runs.profile_config_id
      order by runs.created_at desc
      limit 20
      `
    );

    return Response.json({
      runs: result.rows.map((row) => ({
        ...mapGenerationRunRow(row),
        source_title: row.source_title,
        profile_name: row.profile_name,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch KB generation runs:", error);
    return Response.json({ success: false, error: "Failed to fetch generation runs" }, { status: 500 });
  }
}

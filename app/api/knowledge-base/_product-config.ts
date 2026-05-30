import { db } from "@/lib/db";

export type ProductSourceRow = {
  id: string;
  client_id: string | null;
  title: string;
  source_type: string;
  source_url: string | null;
  file_url: string | null;
  raw_text: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
};

export type SalesProfileRow = {
  id: string;
  client_id: string | null;
  name: string;
  product_type: string;
  tone: string;
  target_audience: string | null;
  main_goal: string | null;
  cta_type: string | null;
  qualification_questions: string | null;
  constraints: string | null;
  is_default: boolean | null;
  created_at: string;
  updated_at: string | null;
};

export type KbGenerationRunRow = {
  id: string;
  client_id: string | null;
  source_id: string | null;
  profile_config_id: string | null;
  status: string;
  generated_items: unknown;
  raw_ai_response: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
};

async function getEsthellenceClientId() {
  const result = await db.query(
    `
    select id
    from clients
    where name = $1
    limit 1
    `,
    ["Esthellence"]
  );

  return (result.rows[0]?.id as string | undefined) ?? null;
}

async function ensurePgcryptoExtension() {
  await db.query(`create extension if not exists pgcrypto`);
}

export async function ensureProductConfigTables() {
  try {
    await ensurePgcryptoExtension();
  } catch (error) {
    console.error("Failed to ensure pgcrypto extension:", error);
  }

  await db.query(`
    create table if not exists product_sources (
      id uuid primary key default gen_random_uuid(),
      client_id uuid null,
      title text not null,
      source_type text not null default 'text',
      source_url text null,
      file_url text null,
      raw_text text null,
      status text not null default 'draft',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )
  `);

  await db.query(`
    create table if not exists sales_profile_configs (
      id uuid primary key default gen_random_uuid(),
      client_id uuid null,
      name text not null,
      product_type text not null,
      tone text not null default 'professionnel, clair et rassurant',
      target_audience text null,
      main_goal text null,
      cta_type text null,
      qualification_questions text null,
      constraints text null,
      is_default boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )
  `);

  await db.query(`
    create table if not exists kb_generation_runs (
      id uuid primary key default gen_random_uuid(),
      client_id uuid null,
      source_id uuid null references product_sources(id) on delete set null,
      profile_config_id uuid null references sales_profile_configs(id) on delete set null,
      status text not null default 'generated',
      generated_items jsonb not null default '[]'::jsonb,
      raw_ai_response text null,
      error_message text null,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )
  `);
}

export function getClientScopeFilter(clientId: string | null) {
  return {
    clientId,
    clause:
      clientId !== null
        ? `(client_id = $1::uuid or client_id is null)`
        : `(client_id is null)`,
  };
}

export async function resolveClientId() {
  return getEsthellenceClientId();
}

export function mapSourceRow(row: ProductSourceRow) {
  return {
    id: row.id,
    client_id: row.client_id,
    title: row.title,
    source_type: row.source_type,
    source_url: row.source_url,
    file_url: row.file_url,
    raw_text: row.raw_text,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapProfileRow(row: SalesProfileRow) {
  return {
    id: row.id,
    client_id: row.client_id,
    name: row.name,
    product_type: row.product_type,
    tone: row.tone,
    target_audience: row.target_audience,
    main_goal: row.main_goal,
    cta_type: row.cta_type,
    qualification_questions: row.qualification_questions,
    constraints: row.constraints,
    is_default: row.is_default ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapGenerationRunRow(row: KbGenerationRunRow) {
  return {
    id: row.id,
    client_id: row.client_id,
    source_id: row.source_id,
    profile_config_id: row.profile_config_id,
    status: row.status,
    generated_items: Array.isArray(row.generated_items) ? row.generated_items : [],
    raw_ai_response: row.raw_ai_response,
    error_message: row.error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const PRODUCT_SOURCE_TYPES = new Set(["text", "url", "file"]);
export const PRODUCT_SOURCE_STATUSES = new Set(["draft", "processed", "archived"]);

import { db } from "@/lib/db";

const KNOWLEDGE_BASE_SCHEMA_LOCK_KEY = 987654321;

let knowledgeBaseSchemaPromise: Promise<void> | null = null;

async function runKnowledgeBaseSchemaSetup() {
  const client = await db.connect();

  try {
    await client.query("select pg_advisory_lock($1)", [KNOWLEDGE_BASE_SCHEMA_LOCK_KEY]);

    await client.query(`create extension if not exists pgcrypto`);

    await client.query(`
      create table if not exists product_sources (
        id uuid primary key default gen_random_uuid(),
        client_id uuid null,
        title text not null,
        source_type text not null default 'text',
        source_url text null,
        file_url text null,
        file_name text null,
        file_mime_type text null,
        file_size integer null,
        raw_text text null,
        status text not null default 'draft',
        extraction_status text not null default 'none',
        extraction_error text null,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      )
    `);

    await client.query(`
      alter table product_sources
      add column if not exists file_name text null
    `);

    await client.query(`
      alter table product_sources
      add column if not exists file_mime_type text null
    `);

    await client.query(`
      alter table product_sources
      add column if not exists file_size integer null
    `);

    await client.query(`
      alter table product_sources
      add column if not exists extraction_status text not null default 'none'
    `);

    await client.query(`
      alter table product_sources
      add column if not exists extraction_error text null
    `);

    await client.query(`
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

    await client.query(`
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
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [KNOWLEDGE_BASE_SCHEMA_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

export async function ensureKnowledgeBaseGeneratorSchema() {
  if (!knowledgeBaseSchemaPromise) {
    knowledgeBaseSchemaPromise = runKnowledgeBaseSchemaSetup().catch((error) => {
      knowledgeBaseSchemaPromise = null;
      throw error;
    });
  }

  return knowledgeBaseSchemaPromise;
}

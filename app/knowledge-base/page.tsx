import DashboardQuickLink from "@/components/DashboardQuickLink";
import KnowledgeBaseDashboard from "@/components/KnowledgeBaseDashboard";
import KnowledgeBaseProductConfig from "@/components/KnowledgeBaseProductConfig";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  return result.rows[0]?.id as string | undefined;
}

function normalizeKeywords(keywords: unknown) {
  if (Array.isArray(keywords)) {
    return keywords.map((value) => String(value).trim()).filter(Boolean);
  }

  if (typeof keywords === "string") {
    return keywords
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
}

export default async function KnowledgeBasePage() {
  const clientId = await getEsthellenceClientId();

  if (!clientId) {
    return (
      <div className="bg-[var(--app-bg)] text-[color:var(--app-fg)]">
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
          <div className="flex justify-end">
            <DashboardQuickLink compact className="text-xs sm:text-sm" />
          </div>
        </div>
        <KnowledgeBaseDashboard initialItems={[]} />
      </div>
    );
  }

  const result = await db.query<KnowledgeBaseRow>(
    `
    select
      id,
      title,
      category,
      question,
      answer,
      keywords,
      is_active,
      created_at,
      updated_at
    from knowledge_base
    where client_id = $1
    order by created_at desc
    `,
    [clientId]
  );

  const items = result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    question: row.question,
    answer: row.answer,
    keywords: normalizeKeywords(row.keywords),
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return (
    <div className="bg-[var(--app-bg)] text-[color:var(--app-fg)]">
      <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
        <div className="flex justify-end">
          <DashboardQuickLink compact className="text-xs sm:text-sm" />
        </div>
      </div>
      <KnowledgeBaseDashboard initialItems={items} />
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <KnowledgeBaseProductConfig />
      </div>
    </div>
  );
}

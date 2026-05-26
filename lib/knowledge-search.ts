import { db } from "@/lib/db";

type KnowledgeBaseRow = {
  id: string;
  title: string | null;
  question: string | null;
  answer: string | null;
  category: string | null;
  keywords: string | null;
  client_id: string;
  is_active: boolean | null;
};

function normalizeValue(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function rowMatches(row: KnowledgeBaseRow, message: string) {
  const haystack = [
    row.title,
    row.question,
    row.answer,
    row.category,
    row.keywords,
  ]
    .map(normalizeValue)
    .join(" ");

  const tokens = normalizeValue(message)
    .split(/[^a-z0-9À-ÿ]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  if (!tokens.length) {
    return false;
  }

  return tokens.some((token) => haystack.includes(token));
}

export async function getRelevantKnowledgeBase(clientId: string, message: string) {
  const result = await db.query<KnowledgeBaseRow>(
    `
    select
      id,
      title,
      question,
      answer,
      category,
      keywords,
      client_id,
      is_active
    from knowledge_base
    where client_id = $1
      and coalesce(is_active, true) = true
    order by created_at desc
    `,
    [clientId]
  );

  const activeRows = result.rows;
  const matchingRows = activeRows.filter((row) => rowMatches(row, message)).slice(0, 5);

  if (matchingRows.length > 0) {
    return matchingRows;
  }

  return activeRows.slice(0, 3);
}

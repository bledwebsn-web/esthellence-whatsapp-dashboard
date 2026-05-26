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

type ScoredKnowledgeBaseRow = KnowledgeBaseRow & {
  __score?: number;
};

const SYNONYMS: Record<string, string[]> = {
  tarif: ["prix", "cout", "combien"],
  prix: ["tarif", "cout", "combien"],
  inscription: ["reserver", "participation", "modalite"],
  formation: ["masterclass", "parcours", "programme"],
  lieu: ["adresse", "ou", "setif"],
  date: ["quand", "calendrier", "planning"],
};

function normalizeValue(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(message: string) {
  return normalizeValue(message)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function rowText(row: KnowledgeBaseRow) {
  const keywords = Array.isArray(row.keywords)
    ? row.keywords.join(" ")
    : String(row.keywords ?? "");

  return [row.title, row.category, row.question, row.answer, keywords]
    .map(normalizeValue)
    .join(" ");
}

function scoreRow(row: KnowledgeBaseRow, tokens: string[]) {
  const text = rowText(row);
  const normalizedTitle = normalizeValue(row.title);
  const normalizedCategory = normalizeValue(row.category);
  let score = 0;

  for (const token of tokens) {
    const variants = [token, ...(SYNONYMS[token] ?? [])].map(normalizeValue);

    for (const variant of variants) {
      if (!variant) {
        continue;
      }

      if (text.includes(variant)) {
        score += variant === token ? 4 : 2;
      }

      if (normalizedCategory === variant) {
        score += 3;
      }

      if (["prix", "tarif", "cout", "combien"].includes(variant)) {
        if (normalizedCategory === "pricing") {
          score += 8;
        }

        if (normalizedTitle.includes("prix") || normalizedTitle.includes("tarif")) {
          score += 6;
        }
      }
    }
  }

  return score;
}

function isPriorityFallbackCategory(category: string | null) {
  const normalized = normalizeValue(category);
  return (
    normalized === "general" ||
    normalized === "fallback" ||
    normalized === "registration"
  );
}

function sortRows(rows: ScoredKnowledgeBaseRow[], fallbackMode: boolean) {
  return rows.sort((left, right) => {
    const leftScore = left.__score ?? 0;
    const rightScore = right.__score ?? 0;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    if (fallbackMode) {
      const leftPriority = isPriorityFallbackCategory(left.category) ? 1 : 0;
      const rightPriority = isPriorityFallbackCategory(right.category) ? 1 : 0;

      if (rightPriority !== leftPriority) {
        return rightPriority - leftPriority;
      }
    }

    return 0;
  });
}

function buildSearchTokens(message: string) {
  const baseTokens = tokenize(message);
  const expanded = new Set<string>();

  for (const token of baseTokens) {
    expanded.add(token);

    for (const synonym of SYNONYMS[token] ?? []) {
      expanded.add(normalizeValue(synonym));
    }
  }

  return Array.from(expanded);
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
  const tokens = buildSearchTokens(message);
  const normalizedMessage = normalizeValue(message);
  const containsPricingIntent = /(?:tarif|prix|cout|coût|combien)/i.test(
    normalizedMessage
  );

  const scoredRows = activeRows.map((row) => ({
    ...row,
    __score: scoreRow(row, tokens),
  }));

  const matchingRows = sortRows(
    scoredRows.filter((row) => (row.__score ?? 0) > 0),
    false
  ).slice(0, 8);

  if (matchingRows.length > 0) {
    if (containsPricingIntent) {
      return matchingRows.sort((left, right) => {
        const leftPriority =
          normalizeValue(left.category) === "pricing" ||
          normalizeValue(left.title).includes("prix") ||
          normalizeValue(left.title).includes("tarif")
            ? 1
            : 0;
        const rightPriority =
          normalizeValue(right.category) === "pricing" ||
          normalizeValue(right.title).includes("prix") ||
          normalizeValue(right.title).includes("tarif")
            ? 1
            : 0;

        if (rightPriority !== leftPriority) {
          return rightPriority - leftPriority;
        }

        return (right.__score ?? 0) - (left.__score ?? 0);
      }).slice(0, 8);
    }

    return matchingRows;
  }

  const fallbackRows = sortRows(
    scoredRows.filter((row) => isPriorityFallbackCategory(row.category)),
    true
  );

  if (fallbackRows.length > 0) {
    return fallbackRows.slice(0, 5);
  }

  return sortRows([...scoredRows], true).slice(0, 5);
}

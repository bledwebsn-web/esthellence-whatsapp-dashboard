import { db } from "@/lib/db";

type ParsedKnowledgeBaseRow = {
  title: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
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

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function splitLine(line: string, separator: string) {
  const cells: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === separator && !insideQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/\r/g, "").trim());
}

function detectSeparator(headerLine: string) {
  return headerLine.includes("\t") ? "\t" : ",";
}

function toKeywordsArray(value: string) {
  return value
    .split(/[;,|]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function parseDelimitedText(content: string): ParsedKnowledgeBaseRow[] {
  const normalized = stripBom(content).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const separator = detectSeparator(lines[0]);
  const headers = splitLine(lines[0], separator).map((header) => header.toLowerCase());

  const findIndex = (candidates: string[]) =>
    headers.findIndex((header) =>
      candidates.some((candidate) => header === candidate || header.includes(candidate))
    );

  const titleIndex = findIndex(["titre", "title"]);
  const categoryIndex = findIndex(["catégorie", "categorie", "category"]);
  const questionIndex = findIndex(["question probable du lead", "question", "lead question"]);
  const answerIndex = findIndex([
    "réponse officielle whatsapp",
    "reponse officielle whatsapp",
    "answer",
  ]);
  const keywordsIndex = findIndex(["mots-clés", "mots cles", "keywords"]);

  const rows: ParsedKnowledgeBaseRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitLine(line, separator);
    const title = cells[titleIndex] ?? "";
    const category = cells[categoryIndex] ?? "";
    const question = cells[questionIndex] ?? "";
    const answer = cells[answerIndex] ?? "";
    const keywords = cells[keywordsIndex] ?? "";

    if (!title && !category && !question && !answer && !keywords) {
      continue;
    }

    rows.push({
      title,
      category,
      question,
      answer,
      keywords: toKeywordsArray(keywords),
    });
  }

  return rows;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { success: false, error: "File is required" },
        { status: 400 }
      );
    }

    const clientId = await getEsthellenceClientId();

    if (!clientId) {
      return Response.json(
        { success: false, error: "Client not found" },
        { status: 404 }
      );
    }

    const rawContent = await file.text();
    const rows = parseDelimitedText(rawContent);

    if (!rows.length) {
      return Response.json(
        { success: false, error: "No valid rows found" },
        { status: 400 }
      );
    }

    const connection = await db.connect();

    try {
      await connection.query("begin");

      let imported = 0;

      for (const row of rows) {
        await connection.query(
          `
          insert into knowledge_base
          (client_id, title, category, question, answer, keywords, is_active)
          values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            clientId,
            row.title,
            row.category,
            row.question,
            row.answer,
            row.keywords,
            true,
          ]
        );
        imported += 1;
      }

      await connection.query("commit");

      return Response.json({ success: true, imported });
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Failed to import knowledge base:", error);

    return Response.json(
      { success: false, error: "Failed to import knowledge base" },
      { status: 500 }
    );
  }
}

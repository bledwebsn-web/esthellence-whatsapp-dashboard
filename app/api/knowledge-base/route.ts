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

function parseKeywordsForDatabase(keywords: unknown) {
  return normalizeKeywords(keywords);
}

function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function mapRow(row: KnowledgeBaseRow) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    question: row.question,
    answer: row.answer,
    keywords: normalizeKeywords(row.keywords),
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET() {
  try {
    const clientId = await getEsthellenceClientId();

    if (!clientId) {
      return Response.json({ items: [] });
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

    return Response.json({
      items: result.rows.map(mapRow),
    });
  } catch (error) {
    console.error("Failed to fetch knowledge base:", error);

    return Response.json(
      {
        error: "Failed to fetch knowledge base",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const clientId = await getEsthellenceClientId();

    if (!clientId) {
      return Response.json(
        {
          success: false,
          error: "Failed to create knowledge base item",
        },
        { status: 404 }
      );
    }

    const body = await request.json();
    const titleInput = String(body.title ?? "").trim();
    const question = String(body.question ?? "").trim();
    const answer = String(body.answer ?? "").trim();
    const category = String(body.category ?? "").trim();
    const title = titleInput || question.slice(0, 120).trim();
    const keywords = parseKeywordsForDatabase(body.keywords);

    if (!title || !answer) {
      return Response.json(
        {
          success: false,
          error: "Failed to create knowledge base item",
        },
        { status: 400 }
      );
    }

    const inserted = await db.query<KnowledgeBaseRow>(
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
      [clientId, title, category, question, answer, keywords, true]
    );

    return Response.json({
      success: true,
      item: inserted.rows[0] ? mapRow(inserted.rows[0]) : null,
    });
  } catch (error) {
    console.error("Failed to create knowledge base item:", error);

    return Response.json(
      {
        success: false,
        error: "Failed to create knowledge base item",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const clientId = await getEsthellenceClientId();

    if (!clientId) {
      return Response.json(
        {
          success: false,
          error: "Failed to update knowledge base item",
        },
        { status: 404 }
      );
    }

    const body = await request.json();
    const id = String(body.id ?? "").trim();

    if (!id) {
      return Response.json(
        {
          success: false,
          error: "Failed to update knowledge base item",
        },
        { status: 400 }
      );
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
      fields.push(`is_active = ${add(toBoolean(body.is_active))}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      fields.push(`title = ${add(String(body.title ?? "").trim())}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      fields.push(`category = ${add(String(body.category ?? "").trim())}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "question")) {
      fields.push(`question = ${add(String(body.question ?? "").trim())}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "answer")) {
      fields.push(`answer = ${add(String(body.answer ?? "").trim())}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "keywords")) {
      fields.push(`keywords = ${add(parseKeywordsForDatabase(body.keywords))}`);
    }

    if (!fields.length) {
      return Response.json(
        {
          success: false,
          error: "Failed to update knowledge base item",
        },
        { status: 400 }
      );
    }

    fields.push(`updated_at = now()`);
    const idPlaceholder = add(id);
    const clientPlaceholder = add(clientId);

    const updated = await db.query<KnowledgeBaseRow>(
      `
      update knowledge_base
      set ${fields.join(", ")}
      where id = ${idPlaceholder}
        and client_id = ${clientPlaceholder}
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
      values
    );

    if (!updated.rows[0]) {
      return Response.json(
        {
          success: false,
          error: "Failed to update knowledge base item",
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      item: mapRow(updated.rows[0]),
    });
  } catch (error) {
    console.error("Failed to update knowledge base item:", error);

    return Response.json(
      {
        success: false,
        error: "Failed to update knowledge base item",
      },
      { status: 500 }
    );
  }
}

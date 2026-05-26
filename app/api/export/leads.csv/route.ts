import { db } from "@/lib/db";

type LeadRow = {
  lead_id: string;
  nom_whatsapp: string | null;
  numero_whatsapp: string | null;
  premier_message: string | null;
  dernier_message: string | null;
  statut: string | null;
  intention_detectee: string | null;
  niveau_urgence: string | null;
  source: string;
  date_creation: string;
  date_dernier_message: string | null;
  resume_ia: string | null;
  agent_assigne: string | null;
};

function escapeCsvValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: LeadRow[]) {
  const headers = [
    "lead_id",
    "nom_whatsapp",
    "numero_whatsapp",
    "premier_message",
    "dernier_message",
    "statut",
    "intention_detectee",
    "niveau_urgence",
    "source",
    "date_creation",
    "date_dernier_message",
    "resume_ia",
    "agent_assigne",
  ];

  const lines = [headers.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.lead_id,
        row.nom_whatsapp,
        row.numero_whatsapp,
        row.premier_message,
        row.dernier_message,
        row.statut,
        row.intention_detectee,
        row.niveau_urgence,
        row.source,
        row.date_creation,
        row.date_dernier_message,
        row.resume_ia,
        row.agent_assigne,
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function GET() {
  try {
    const result = await db.query<LeadRow>(
      `
      select
        conv.id as lead_id,
        c.profile_name as nom_whatsapp,
        c.phone as numero_whatsapp,
        (
          select m.content
          from messages m
          where m.conversation_id = conv.id
            and m.direction = 'inbound'
          order by m.created_at asc
          limit 1
        ) as premier_message,
        conv.last_message_preview as dernier_message,
        conv.status as statut,
        conv.detected_intent as intention_detectee,
        conv.urgency_level as niveau_urgence,
        'meta_click_to_whatsapp' as source,
        conv.created_at as date_creation,
        conv.last_message_at as date_dernier_message,
        conv.ai_summary as resume_ia,
        conv.assigned_to as agent_assigne
      from conversations conv
      inner join contacts c on c.id = conv.contact_id
      order by conv.created_at desc
      `
    );

    const csv = toCsv(result.rows);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="esthellence-leads.csv"',
      },
    });
  } catch (error) {
    console.error("Failed to export leads CSV:", error);

    return Response.json(
      {
        error: "Failed to export leads CSV",
      },
      { status: 500 }
    );
  }
}

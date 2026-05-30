type GenerateKbDraftsPromptParams = {
  source: {
    title: string;
    source_type: string;
    source_url: string | null;
    raw_text: string | null;
  };
  profile: {
    name: string;
    product_type: string;
    tone: string;
    target_audience: string | null;
    main_goal: string | null;
    cta_type: string | null;
    qualification_questions: string | null;
    constraints: string | null;
  };
  count: number;
};

export function buildKbDraftsSystemPrompt() {
  return [
    "Tu es un assistant de préparation de base de connaissances WhatsApp Business.",
    "Tu génères des questions/réponses commerciales à partir d’une source produit validée.",
    "Tu dois répondre uniquement avec les informations présentes dans la source.",
    "Tu ne dois jamais inventer un prix, une date, une disponibilité, une promesse, une condition ou une offre.",
    "Si une information manque, la réponse doit proposer un transfert à un conseiller.",
    "Le ton doit être professionnel, clair, rassurant, court et adapté à WhatsApp.",
    "Chaque réponse doit proposer une prochaine action concrète.",
    "Tu retournes uniquement un JSON valide.",
  ].join(" ");
}

export const GROQ_SYSTEM_PROMPT = buildKbDraftsSystemPrompt();

export function buildKbDraftsUserPrompt({
  source,
  profile,
  count,
}: GenerateKbDraftsPromptParams) {
  return [
    `Source produit: ${JSON.stringify(source, null, 2)}`,
    `Profil commercial: ${JSON.stringify(profile, null, 2)}`,
    `Nombre de propositions demandé: ${count}`,
    "",
    "Tu dois produire un objet JSON avec exactement cette forme:",
    JSON.stringify(
      {
        items: [
          {
            title: "string",
            category: "string",
            question: "string",
            answer: "string",
            keywords: ["string"],
            detected_intent: "string",
            sales_profile: "string",
            confidence: "high",
            needs_review: true,
            notes: "string",
          },
        ],
      },
      null,
      2
    ),
    "",
    "Règles métier:",
    "- answer doit être courte, claire et adaptée WhatsApp.",
    "- needs_review doit toujours être true.",
    "- confidence ne doit jamais servir à auto-valider.",
    "- Si une information manque dans la source, proposer un transfert à un conseiller.",
    "- N’invente jamais une information absente de la source.",
    "- Retourne au maximum le nombre de propositions demandé.",
    "- Varie les questions pour couvrir les besoins les plus pertinents du profil.",
    "",
    "Exemples de thèmes possibles selon le profil, uniquement si la source les contient:",
    profile.product_type === "Formation / Masterclass"
      ? "- prix, dates, programme, inscription, prérequis, certificat, lieu, modalités de paiement"
      : profile.product_type === "Clinique / Soin"
        ? "- type de soin, durée, rendez-vous, contre-indications si présentes, transfert humain si info sensible"
        : profile.product_type === "Immobilier"
          ? "- budget, localisation, type de bien, disponibilité, visite"
          : profile.product_type === "E-commerce"
            ? "- prix, disponibilité, livraison, paiement, retour"
            : profile.product_type === "Service B2B"
              ? "- besoin, taille entreprise, devis, appel commercial"
              : profile.product_type === "Événement"
                ? "- date, lieu, programme, inscription, places disponibles si présentes"
                : "- questions fréquentes générales",
  ].join("\n");
}

type SendWhatsAppTextMessageParams = {
  to: string;
  body: string;
};

export async function sendWhatsAppTextMessage(
  params: SendWhatsAppTextMessageParams
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";

  if (!token) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing");
  }

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is missing");
  }

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: {
          body: params.body,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Meta WhatsApp API request failed: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

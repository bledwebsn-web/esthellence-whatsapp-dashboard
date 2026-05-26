export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    console.log("WhatsApp webhook payload:", JSON.stringify(payload, null, 2));

    return Response.json({
      received: true,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    return Response.json(
      {
        received: false,
        error: "Invalid payload",
      },
      { status: 400 }
    );
  }
}

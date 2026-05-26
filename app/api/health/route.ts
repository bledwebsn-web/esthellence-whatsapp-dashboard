export async function GET() {
  return Response.json({
    status: "ok",
    service: "esthellence-whatsapp-ads-ai-dashboard",
    timestamp: new Date().toISOString(),
  });
}

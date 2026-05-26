import {
  getAiSettings,
  saveAiSettings,
  validateAiSettingsPayload,
} from "@/lib/ai-settings";

export async function GET() {
  const settings = await getAiSettings();

  return Response.json(settings);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = validateAiSettingsPayload(body);

    const saved = await saveAiSettings(settings);

    return Response.json({
      success: true,
      ...saved,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save AI settings";

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
}

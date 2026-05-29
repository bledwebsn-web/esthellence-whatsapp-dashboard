import { loadDashboardData } from "@/components/DashboardHome";

export async function GET() {
  try {
    const data = await loadDashboardData();

    return Response.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("Failed to load dashboard:", error);

    return Response.json(
      {
        success: false,
        error: "Impossible de charger le dashboard.",
      },
      { status: 500 }
    );
  }
}

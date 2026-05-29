import DashboardHome, { loadDashboardData } from "@/components/DashboardHome";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await loadDashboardData();

  return <DashboardHome data={data} />;
}

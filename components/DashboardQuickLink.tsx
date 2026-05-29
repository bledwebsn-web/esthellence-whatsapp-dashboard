import GlassIconButton from "@/components/GlassIconButton";

type DashboardQuickLinkProps = {
  className?: string;
  compact?: boolean;
};

export default function DashboardQuickLink({
  className = "",
  compact = false,
}: DashboardQuickLinkProps) {
  return (
    <GlassIconButton
      href="/"
      src="/icons/actions/button-home.png"
      alt="Dashboard"
      ariaLabel="Retour au dashboard"
      title="Dashboard"
      className={className}
      imgClassName="h-full w-full object-contain"
    />
  );
}

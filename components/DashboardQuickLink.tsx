import Link from "next/link";

type DashboardQuickLinkProps = {
  className?: string;
  compact?: boolean;
};

export default function DashboardQuickLink({
  className = "",
  compact = false,
}: DashboardQuickLinkProps) {
  return (
    <Link
      href="/"
      aria-label="Retour au dashboard"
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1] ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {compact ? "🏠" : "⌂"}
      </span>
      <span className="whitespace-nowrap">{compact ? "Dashboard" : "Dashboard"}</span>
    </Link>
  );
}

import KnowledgeBaseForm, {
  KnowledgeBaseItemAction,
} from "@/components/KnowledgeBaseForm";

type KnowledgeBaseItem = {
  id: string;
  title: string | null;
  category: string | null;
  question: string | null;
  answer: string | null;
  keywords: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function KnowledgeBasePage() {
  const response = await fetch(`${getBaseUrl()}/api/knowledge-base`, {
    cache: "no-store",
  });

  const data: { items?: KnowledgeBaseItem[] } = await response.json();
  const items = data.items ?? [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
            Esthellence Knowledge Base
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Base de connaissances Esthellence
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Gérez ici les réponses officielles utilisées par l’IA pour suggérer
            des réponses WhatsApp cohérentes et contrôlées.
          </p>
        </div>

        <div className="mb-8">
          <KnowledgeBaseForm />
        </div>

        <div className="grid gap-4">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-16 text-center text-sm text-slate-300 shadow-2xl shadow-cyan-950/20">
              Aucune entrée dans la base de connaissances.
            </div>
          ) : (
            items.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-semibold text-white">
                          {item.title ?? "Sans titre"}
                        </h2>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                            item.is_active
                              ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20"
                              : "bg-slate-500/10 text-slate-300 ring-slate-500/20"
                          }`}
                        >
                          {item.is_active ? "Actif" : "Inactif"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-cyan-200">{item.category ?? "—"}</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Question
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-200">
                          {item.question ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Réponse
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-200">
                          {item.answer ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Mots-clés
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.keywords.length > 0 ? (
                          item.keywords.map((keyword) => (
                            <span
                              key={`${item.id}-${keyword}`}
                              className="inline-flex rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200 ring-1 ring-inset ring-cyan-400/20"
                            >
                              {keyword}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-400">Aucun mot-clé.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-3 text-sm text-slate-300 lg:items-end">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                      Créé le {formatDate(item.created_at)}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                      Mis à jour le {formatDate(item.updated_at)}
                    </div>
                    <KnowledgeBaseItemAction id={item.id} isActive={item.is_active} />
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

import AiSettingsForm from "@/components/AiSettingsForm";
import { getAiSettings } from "@/lib/ai-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAiSettings();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
            Esthellence WhatsApp
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Réglages IA
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Configurez le mode IA pour préparer l'auto-réponse limitée sans
            l'activer par défaut.
          </p>
        </div>

        <div className="mb-8 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-50">
          Pour le test MVP, il est recommandé de rester en Suggestion
          uniquement. L'auto-réponse limitée doit être activée seulement après
          validation humaine des réponses IA.
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <AiSettingsForm initialSettings={settings} />

          <aside className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/20">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Mode IA actuel
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {settings.mode}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Auto-réponse
              </div>
              <div className="mt-2 text-sm text-slate-200">
                {settings.auto_reply_enabled ? "Activée" : "Désactivée"}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Confidence minimale
              </div>
              <div className="mt-2 text-sm text-slate-200">
                {settings.min_confidence}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Intentions autorisées
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {settings.allowed_auto_intents.map((intent) => (
                  <span
                    key={intent}
                    className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200"
                  >
                    {intent}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

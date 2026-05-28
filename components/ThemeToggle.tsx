"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";

type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "esthellence_theme";

function resolveSystemTheme() {
  if (typeof window === "undefined") {
    return "dark" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    setHydrated(true);
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "auto") {
        setMode(stored);
      } else {
        setMode("auto");
      }
    } catch {
      setMode("auto");
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage failures
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolvedTheme = mode === "auto" ? resolveSystemTheme() : mode;

    applyTheme(resolvedTheme);

    if (mode !== "auto") {
      return;
    }

    const handleChange = () => {
      applyTheme(resolveSystemTheme());
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [hydrated, mode]);

  const nextMode = useMemo<ThemeMode>(() => {
    if (mode === "auto") return "light";
    if (mode === "light") return "dark";
    return "auto";
  }, [mode]);

  const label = useMemo(() => {
    switch (mode) {
      case "light":
        return "☀️ Clair";
      case "dark":
        return "🌙 Sombre";
      default:
        return "🖥️ Auto";
    }
  }, [mode]);

  const buttonTitle = useMemo(() => {
    switch (nextMode) {
      case "light":
        return "Passer en mode clair";
      case "dark":
        return "Passer en mode sombre";
      default:
        return "Passer en mode auto";
    }
  }, [nextMode]);

  return (
    <button
      type="button"
      aria-label="Changer de thème"
      title={buttonTitle}
      onClick={() => setMode(nextMode)}
      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-[11px] font-medium text-[var(--app-fg)] shadow-sm shadow-black/10 backdrop-blur-md transition hover:scale-[1.02] hover:bg-[var(--app-panel)]"
    >
      <span>{label}</span>
    </button>
  );
}

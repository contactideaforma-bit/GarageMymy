"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const isLight = document.documentElement.classList.toggle("light");
    try {
      localStorage.setItem("theme", isLight ? "light" : "dark");
    } catch {}
    setLight(isLight);
  }

  return (
    <button onClick={toggle} className="nav-lien nav-compact justify-between" title="Changer de thème">
      <span className="flex items-center gap-2">{light ? "Mode clair" : "Mode sombre"}</span>
      <span
        className="relative h-5 w-9 shrink-0 rounded-full border transition-colors"
        style={{
          background: light ? "var(--mea-neon-fond-2)" : "var(--mea-surface-2)",
          borderColor: light ? "var(--mea-neon-bordure)" : "var(--mea-bordure-2)",
          boxShadow: light ? "var(--mea-lueur)" : "none",
        }}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${light ? "left-[1.15rem]" : "left-0.5"}`}
          style={{
            background: light ? "linear-gradient(135deg, #8b5cf6, #ec4899)" : "rgba(238,240,251,0.7)",
          }}
        />
      </span>
    </button>
  );
}

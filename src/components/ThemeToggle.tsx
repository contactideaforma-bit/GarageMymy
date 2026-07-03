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
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
      title="Changer de thème"
    >
      <span className="flex items-center gap-3">
        {light ? "Mode clair" : "Mode sombre"}
      </span>
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          light ? "bg-accent-violet" : "bg-white/20"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            light ? "left-[1.15rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ModalShell from "@/components/ModalShell";

/**
 * EASTER EGG : Snake rétro (5 clics sur le logo).
 * Flèches du clavier ou boutons tactiles. Meilleur score conservé en local.
 */

const N = 18; // grille N x N
const CELL = 20; // px logiques
type Pos = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const OPPOSE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export default function SnakeGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [etat, setEtat] = useState<"pret" | "joue" | "fini">("pret");
  const [score, setScore] = useState(0);
  const [record, setRecord] = useState(0);

  // État du jeu dans des refs (boucle sans re-render)
  const serpent = useRef<Pos[]>([]);
  const dir = useRef<Dir>("right");
  const prochaineDir = useRef<Dir>("right");
  const pomme = useRef<Pos>({ x: 10, y: 10 });
  const scoreRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      setRecord(Number(localStorage.getItem("mea_snake_record")) || 0);
    } catch {}
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const dessiner = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // fond
    ctx.fillStyle = "#14102b";
    ctx.fillRect(0, 0, N * CELL, N * CELL);
    // quadrillage léger
    ctx.strokeStyle = "rgba(139,92,246,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < N; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, N * CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(N * CELL, i * CELL); ctx.stroke();
    }
    // pomme
    ctx.fillStyle = "#ec4899";
    ctx.fillRect(pomme.current.x * CELL + 3, pomme.current.y * CELL + 3, CELL - 6, CELL - 6);
    // serpent
    serpent.current.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? "#10b981" : "#2dd4bf";
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }, []);

  const placerPomme = useCallback(() => {
    let p: Pos;
    do {
      p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    } while (serpent.current.some((s) => s.x === p.x && s.y === p.y));
    pomme.current = p;
  }, []);

  const finDePartie = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setEtat("fini");
    setRecord((r) => {
      const nouveau = Math.max(r, scoreRef.current);
      try { localStorage.setItem("mea_snake_record", String(nouveau)); } catch {}
      return nouveau;
    });
  }, []);

  const tick = useCallback(() => {
    dir.current = prochaineDir.current;
    const tete = serpent.current[0];
    const d = dir.current;
    const nouvelle: Pos = {
      x: tete.x + (d === "right" ? 1 : d === "left" ? -1 : 0),
      y: tete.y + (d === "down" ? 1 : d === "up" ? -1 : 0),
    };
    // collision murs ou soi-même
    if (
      nouvelle.x < 0 || nouvelle.x >= N || nouvelle.y < 0 || nouvelle.y >= N ||
      serpent.current.some((s) => s.x === nouvelle.x && s.y === nouvelle.y)
    ) {
      finDePartie();
      return;
    }
    serpent.current.unshift(nouvelle);
    if (nouvelle.x === pomme.current.x && nouvelle.y === pomme.current.y) {
      scoreRef.current += 10;
      setScore(scoreRef.current);
      placerPomme();
      // accélère un peu tous les 50 points
      if (timer.current && scoreRef.current % 50 === 0) {
        clearInterval(timer.current);
        const vitesse = Math.max(60, 150 - scoreRef.current);
        timer.current = setInterval(tickRef.current!, vitesse);
      }
    } else {
      serpent.current.pop();
    }
    dessiner();
  }, [dessiner, finDePartie, placerPomme]);

  // tick stable pour le setInterval ré-armé
  const tickRef = useRef<(() => void) | null>(null);
  useEffect(() => { tickRef.current = tick; }, [tick]);

  const demarrer = useCallback(() => {
    serpent.current = [{ x: 5, y: 9 }, { x: 4, y: 9 }, { x: 3, y: 9 }];
    dir.current = "right";
    prochaineDir.current = "right";
    scoreRef.current = 0;
    setScore(0);
    placerPomme();
    setEtat("joue");
    dessiner();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => tickRef.current?.(), 150);
  }, [dessiner, placerPomme]);

  function tourner(d: Dir) {
    if (d !== OPPOSE[dir.current]) prochaineDir.current = d;
  }

  // Clavier
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, Dir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        z: "up", s: "down", q: "left", d: "right",
      };
      const d = map[e.key];
      if (d) {
        e.preventDefault();
        tourner(d);
      } else if (e.key === " " && etat !== "joue") {
        e.preventDefault();
        demarrer();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [etat, demarrer]);

  useEffect(() => { dessiner(); }, [dessiner]);

  return (
    <ModalShell title="Snake — pause arcade" onClose={onClose}>
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[0.6rem]" style={{ color: "#2dd4bf" }}>SCORE {score}</span>
        <span className="font-pixel text-[0.6rem]" style={{ color: "#f59e0b" }}>RECORD {record}</span>
      </div>

      <div className="relative mx-auto w-full max-w-[360px]">
        <canvas
          ref={canvasRef}
          width={N * CELL}
          height={N * CELL}
          className="w-full rounded-md border-2 border-white/25"
          style={{ imageRendering: "pixelated", backgroundColor: "#14102b" }}
        />
        {etat !== "joue" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 rounded-md">
            {etat === "fini" && (
              <div className="font-pixel text-[0.8rem] text-rose-400">GAME OVER</div>
            )}
            <button onClick={demarrer} className="btn-primary">
              {etat === "fini" ? "Rejouer" : "Jouer"}
            </button>
            <div className="text-xs text-white/60">Flèches (ou ZQSD) pour diriger</div>
          </div>
        )}
      </div>

      {/* Manette tactile */}
      <div className="mx-auto grid w-40 grid-cols-3 gap-1.5">
        <span />
        <button onClick={() => tourner("up")} className="btn-ghost py-2 px-0 text-sm" aria-label="Haut">▲</button>
        <span />
        <button onClick={() => tourner("left")} className="btn-ghost py-2 px-0 text-sm" aria-label="Gauche">◀</button>
        <button onClick={() => tourner("down")} className="btn-ghost py-2 px-0 text-sm" aria-label="Bas">▼</button>
        <button onClick={() => tourner("right")} className="btn-ghost py-2 px-0 text-sm" aria-label="Droite">▶</button>
      </div>

      <p className="text-center text-xs text-white/40">
        Tu l&apos;as bien mérité. Les dossiers t&apos;attendent quand tu as fini.
      </p>
    </ModalShell>
  );
}

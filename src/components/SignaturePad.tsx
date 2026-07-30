"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pad de signature : dessin au doigt (tactile) ou à la souris.
 * Renvoie un dataURL PNG (fond blanc) via onChange, ou null si vide.
 */
export default function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [vide, setVide] = useState(true);

  // Le canevas est redimensionné au montage ET à chaque changement de taille
  // (rotation d'une tablette, ouverture du clavier…). Sans ça, le buffer
  // gardait l'échelle initiale : tracé décalé et « Effacer » qui laissait des
  // résidus. Le contenu déjà dessiné est préservé.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function dimensionner() {
      const c = canvasRef.current;
      if (!c) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      const w = Math.round(rect.width * ratio);
      const h = Math.round(rect.height * ratio);
      if (w === 0 || h === 0 || (c.width === w && c.height === h)) return;

      // Sauvegarde du tracé existant avant le redimensionnement (qui efface).
      const ancien = hasInk.current ? c.toDataURL("image/png") : null;
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (ancien) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = ancien;
      }
    }

    dimensionner();
    const observer = new ResizeObserver(dimensionner);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      setVide(false);
    }
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = e.currentTarget;
    if (hasInk.current) onChange(canvas.toDataURL("image/png"));
  }

  function effacer() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // On efface TOUT le buffer (et pas seulement la zone CSS) : après une
    // rotation d'écran, il pouvait rester des traces sur les bords.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hasInk.current = false;
    setVide(true);
    onChange(null);
  }

  return (
    <div>
      <div className="rounded-lg border border-white/20 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-40 touch-none cursor-crosshair block"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-white/40">
          {vide ? "Signe dans le cadre (doigt ou souris)." : "Signature capturée ✓"}
        </span>
        <button type="button" onClick={effacer} className="btn-ghost py-1 px-3 text-xs">
          Effacer
        </button>
      </div>
    </div>
  );
}

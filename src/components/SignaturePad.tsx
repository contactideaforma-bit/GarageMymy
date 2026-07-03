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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
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

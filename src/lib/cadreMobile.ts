"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * CADRAGE DES MODALES SUR TÉLÉPHONE (v11.2) — généralisation du correctif
 * de la note de dossier (v8.7).
 *
 * Sur iPhone, un élément `position: fixed; inset: 0` se cale sur la fenêtre
 * de MISE EN PAGE, pas sur la zone réellement visible : quand le clavier
 * monte (formulaire d'import, éditeur de facture…), ou quand Safari fait
 * glisser la page sous le clavier, la modale déborde à droite et sous le
 * clavier — les champs du bas sont « hors champ ». Ce hook renvoie, sur
 * téléphone uniquement, le cadre exact de `window.visualViewport`
 * (recalculé sur `resize` et `scroll`) à poser en style inline sur le
 * voile de la modale. Sur PC il ne renvoie rien : `inset-0` suffit.
 */
export function useZoneVisible(actif = true): { mobile: boolean; style: CSSProperties | undefined } {
  const [mobile, setMobile] = useState(false);
  const [zone, setZone] = useState<{ top: number; left: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const maj = () => setMobile(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);

  useEffect(() => {
    if (!actif || !mobile) {
      setZone(null);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const maj = () => setZone({ top: vv.offsetTop, left: vv.offsetLeft, w: vv.width, h: vv.height });
    maj();
    vv.addEventListener("resize", maj);
    vv.addEventListener("scroll", maj);
    return () => {
      vv.removeEventListener("resize", maj);
      vv.removeEventListener("scroll", maj);
    };
  }, [actif, mobile]);

  const style: CSSProperties | undefined =
    mobile && zone
      ? { top: zone.top, left: zone.left, width: zone.w, height: zone.h, right: "auto", bottom: "auto" }
      : undefined;
  return { mobile, style };
}

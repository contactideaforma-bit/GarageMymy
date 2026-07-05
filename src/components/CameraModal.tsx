"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ModalShell from "@/components/ModalShell";

/**
 * Prise de photo DANS l'appli : demande l'autorisation d'accéder à
 * l'appareil photo (caméra arrière sur téléphone), aperçu en direct,
 * capture, vérification, validation. La photo est renvoyée en dataURL
 * (convertie en PDF par l'appelant).
 */
export default function CameraModal({
  titre = "Prendre une photo",
  onCapture,
  onClose,
}: {
  titre?: string;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const arreterCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const demarrerCamera = useCallback(async () => {
    setErreur(null);
    try {
      // Le navigateur affiche ici la demande d'autorisation du téléphone
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setErreur(
        "Accès à l'appareil photo refusé ou indisponible. Autorise la caméra dans les réglages du navigateur, ou utilise le bouton « Fichier »."
      );
    }
  }, []);

  useEffect(() => {
    demarrerCamera();
    return () => arreterCamera();
  }, [demarrerCamera, arreterCamera]);

  function capturer() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.88));
    arreterCamera();
  }

  function reprendre() {
    setPhoto(null);
    demarrerCamera();
  }

  return (
    <ModalShell title={titre} onClose={() => { arreterCamera(); onClose(); }}>
      {erreur && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
          {erreur}
        </div>
      )}

      {!photo ? (
        <>
          <div className="overflow-hidden rounded-md border-2 border-white/25 bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="w-full" />
          </div>
          <div className="flex justify-center">
            <button onClick={capturer} disabled={Boolean(erreur)} className="btn-primary">
              Capturer
            </button>
          </div>
          <p className="text-center text-xs text-white/40">
            Cadre bien le document, lumière au-dessus, puis Capturer.
          </p>
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border-2 border-white/25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Photo capturée" className="w-full" />
          </div>
          <div className="flex justify-center gap-3">
            <button onClick={reprendre} className="btn-ghost">Reprendre</button>
            <button
              onClick={() => {
                onCapture(photo);
                onClose();
              }}
              className="btn-primary"
            >
              Valider — enregistrer en PDF
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Les clients sont désormais dans l'Annuaire (onglet Clients).
export default function ClientsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/annuaire");
  }, [router]);
  return <p className="text-white/40">Redirection vers l&apos;annuaire…</p>;
}

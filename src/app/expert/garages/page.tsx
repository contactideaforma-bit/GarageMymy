"use client";

// v13.6 : les réparateurs vivent dans la base de données (/expert/annuaire).
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PageGaragesExpert() {
  const router = useRouter();
  useEffect(() => { router.replace("/expert/annuaire?onglet=garages"); }, [router]);
  return <div className="skeleton h-40 rounded-2xl" />;
}

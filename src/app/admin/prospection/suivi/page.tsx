"use client";

import ProspectionEditeur from "@/components/admin/ProspectionEditeur";

/** v13.3 : accès direct au suivi des prospects attribués (onglet éditeur). */
export default function SuiviProspectsPage() {
  return <ProspectionEditeur ongletInitial="suivi" />;
}

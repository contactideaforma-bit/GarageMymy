import OngletsDossiers from "@/components/OngletsDossiers";

// v12.5 — barre d'onglets commune à la liste et aux fiches : on garde
// plusieurs dossiers ouverts et on passe de l'un à l'autre en un clic.
export default function SinistresLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <OngletsDossiers />
      {children}
    </div>
  );
}

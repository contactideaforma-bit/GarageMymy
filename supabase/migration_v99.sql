-- ============================================================
--  v13.42 (migration v99) — Formule du garage connecté (ma_formule)
--  Le suivi des impayés et le suivi des litiges sont réservés aux
--  formules Adhésion Service (starter / confort / serenite = Plus /
--  Premium / Ultimate). L'appli garage doit donc connaître SA formule
--  sans lire la table `abonnements` (réservée à l'éditeur).
--  Fonction SECURITY DEFINER : renvoie la formule de l'abonnement actif
--  (ou suspendu) du compte connecté, par `garage_owner_id` ou, à défaut,
--  par l'email du compte. NULL = aucun abonnement connu (compte d'essai,
--  démo, éditeur) → l'appli considère l'accès complet.
-- ============================================================

create or replace function public.ma_formule()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select a.formule
  from public.abonnements a
  where a.statut in ('actif', 'suspendu')
    and (
      a.garage_owner_id = auth.uid()
      or (a.garage_owner_id is null and a.garage_email is not null
          and lower(a.garage_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
  order by (a.garage_owner_id = auth.uid()) desc nulls last, a.date_debut desc, a.created_at desc
  limit 1;
$$;

revoke all on function public.ma_formule() from public;
grant execute on function public.ma_formule() to authenticated, anon, service_role;

-- ============================================================
--  MIGRATION v105 — CONSOLIDATION DE LA BASE MUTUALISÉE EN SQL (v13.55)
--  La consolidation experts / assureurs se fait désormais DANS la base
--  (fonction), appelée par le serveur : plus robuste que le calcul côté
--  Node, et testable directement dans le SQL Editor.
--  Clé de dédoublonnage : e-mail (minuscules) > téléphone (chiffres) >
--  nom + ville normalisés. Le champ le plus long l'emporte, `garages` =
--  nombre de comptes distincts. Les lignes « vérifié » ne sont pas
--  écrasées (compteur seulement) ; `notes`, `verifie`, `partage` jamais touchés.
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

create or replace function public.mutualise_norm(t text) returns text language sql immutable as $$
  select nullif(trim(regexp_replace(translate(lower(coalesce(t, '')), 'àâäáãéèêëíîïóôöõúùûüçñ', 'aaaaaeeeeiiiooooouuuucn'), '[^a-z0-9]+', ' ', 'g')), '')
$$;

create or replace function public.mutualise_tel(t text) returns text language sql immutable as $$
  select case
    when length(regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g')) >= 9
    then regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''), '[^0-9+]', '', 'g'), '^\+33', '0'), '^0033', '0')
    else null end
$$;

create or replace function public.mutualise_email(t text) returns text language sql immutable as $$
  select case when lower(trim(coalesce(t, ''))) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(trim(t)) else null end
$$;

create or replace function public.consolider_annuaire_mutualise()
returns table (experts_lus int, assureurs_lus int, experts_distincts int, assureurs_distincts int)
language plpgsql security definer set search_path = public as $$
declare
  n_e int; n_a int; d_e int; d_a int;
begin
  -- ---------- EXPERTS ----------
  create temp table tmp_exp on commit drop as
  select e.*,
    coalesce(
      'e:' || mutualise_email(e.email),
      't:' || mutualise_tel(e.tel),
      case when mutualise_norm(e.cabinet) is not null then 'n:' || mutualise_norm(e.cabinet) || '|' || coalesce(mutualise_norm(e.ville), '') end,
      'x:' || mutualise_email(e.expert_email),
      case when mutualise_norm(e.expert_nom) is not null then 'xn:' || mutualise_norm(e.expert_nom) end
    ) as cle
  from experts e;
  select count(*) into n_e from tmp_exp;

  create temp table tmp_exp_c on commit drop as
  select cle,
    (array_agg(cabinet      order by length(coalesce(cabinet,''))      desc nulls last))[1] as cabinet,
    (array_agg(adresse      order by length(coalesce(adresse,''))      desc nulls last))[1] as adresse,
    (array_agg(code_postal  order by length(coalesce(code_postal,''))  desc nulls last))[1] as code_postal,
    (array_agg(ville        order by length(coalesce(ville,''))        desc nulls last))[1] as ville,
    (array_agg(tel          order by length(coalesce(tel,''))          desc nulls last))[1] as tel,
    (array_agg(email        order by length(coalesce(email,''))        desc nulls last))[1] as email,
    (array_agg(expert_nom   order by length(coalesce(expert_nom,''))   desc nulls last))[1] as expert_nom,
    (array_agg(expert_tel   order by length(coalesce(expert_tel,''))   desc nulls last))[1] as expert_tel,
    (array_agg(expert_email order by length(coalesce(expert_email,'')) desc nulls last))[1] as expert_email,
    greatest(1, count(distinct owner_id))::int as garages
  from tmp_exp where cle is not null group by cle;
  select count(*) into d_e from tmp_exp_c;

  insert into mutualise_experts (cle, cabinet, adresse, code_postal, ville, tel, email, expert_nom, expert_tel, expert_email, garages, maj_le)
  select cle, nullif(cabinet,''), nullif(adresse,''), nullif(code_postal,''), nullif(ville,''), nullif(tel,''), nullif(email,''), nullif(expert_nom,''), nullif(expert_tel,''), nullif(expert_email,''), garages, now()
  from tmp_exp_c
  on conflict (cle) do update set
    cabinet = case when mutualise_experts.verifie then mutualise_experts.cabinet else excluded.cabinet end,
    adresse = case when mutualise_experts.verifie then mutualise_experts.adresse else excluded.adresse end,
    code_postal = case when mutualise_experts.verifie then mutualise_experts.code_postal else excluded.code_postal end,
    ville = case when mutualise_experts.verifie then mutualise_experts.ville else excluded.ville end,
    tel = case when mutualise_experts.verifie then mutualise_experts.tel else excluded.tel end,
    email = case when mutualise_experts.verifie then mutualise_experts.email else excluded.email end,
    expert_nom = case when mutualise_experts.verifie then mutualise_experts.expert_nom else excluded.expert_nom end,
    expert_tel = case when mutualise_experts.verifie then mutualise_experts.expert_tel else excluded.expert_tel end,
    expert_email = case when mutualise_experts.verifie then mutualise_experts.expert_email else excluded.expert_email end,
    garages = excluded.garages,
    maj_le = now();

  -- ---------- ASSUREURS ----------
  create temp table tmp_ass on commit drop as
  select a.*,
    coalesce(
      'e:' || mutualise_email(a.email),
      't:' || mutualise_tel(a.tel),
      case when mutualise_norm(a.nom) is not null then 'n:' || mutualise_norm(a.nom) || '|' || coalesce(mutualise_norm(a.ville), '') end
    ) as cle
  from assureurs a;
  select count(*) into n_a from tmp_ass;

  create temp table tmp_ass_c on commit drop as
  select cle,
    (array_agg(nom         order by length(coalesce(nom,''))         desc nulls last))[1] as nom,
    (array_agg(adresse     order by length(coalesce(adresse,''))     desc nulls last))[1] as adresse,
    (array_agg(code_postal order by length(coalesce(code_postal,'')) desc nulls last))[1] as code_postal,
    (array_agg(ville       order by length(coalesce(ville,''))       desc nulls last))[1] as ville,
    (array_agg(tel         order by length(coalesce(tel,''))         desc nulls last))[1] as tel,
    (array_agg(email       order by length(coalesce(email,''))       desc nulls last))[1] as email,
    (array_agg(siren       order by length(coalesce(siren,''))       desc nulls last))[1] as siren,
    greatest(1, count(distinct owner_id))::int as garages
  from tmp_ass where cle is not null group by cle;
  select count(*) into d_a from tmp_ass_c;

  insert into mutualise_assureurs (cle, nom, adresse, code_postal, ville, tel, email, siren, garages, maj_le)
  select cle, nullif(nom,''), nullif(trim(adresse),''), nullif(code_postal,''), nullif(ville,''), nullif(trim(tel),''), nullif(email,''), nullif(siren,''), garages, now()
  from tmp_ass_c
  on conflict (cle) do update set
    nom = case when mutualise_assureurs.verifie then mutualise_assureurs.nom else excluded.nom end,
    adresse = case when mutualise_assureurs.verifie then mutualise_assureurs.adresse else excluded.adresse end,
    code_postal = case when mutualise_assureurs.verifie then mutualise_assureurs.code_postal else excluded.code_postal end,
    ville = case when mutualise_assureurs.verifie then mutualise_assureurs.ville else excluded.ville end,
    tel = case when mutualise_assureurs.verifie then mutualise_assureurs.tel else excluded.tel end,
    email = case when mutualise_assureurs.verifie then mutualise_assureurs.email else excluded.email end,
    siren = case when mutualise_assureurs.verifie then mutualise_assureurs.siren else excluded.siren end,
    garages = excluded.garages,
    maj_le = now();

  return query select n_e, n_a, d_e, d_a;
end $$;

-- Réservée au serveur (service role) : aucun droit pour les clients.
revoke all on function public.consolider_annuaire_mutualise() from public, anon, authenticated;

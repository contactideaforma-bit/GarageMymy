"use client";

// CONDITIONS GÉNÉRALES D'UTILISATION — page PUBLIQUE (v9.4).
// Rédigées pour un service B2B réservé aux professionnels de la réparation
// automobile. À faire relire par un conseil avant toute diffusion massive.

import { PageVitrine, BlocLegal } from "@/components/vitrine/Vitrine";
import { SOCIETE, ADRESSE_COMPLETE } from "@/components/vitrine/societe";

export default function CguPage() {
  return (
    <PageVitrine
      titre="Conditions générales d'utilisation"
      sousTitre="Les règles qui encadrent l'accès et l'usage de l'application My Easy Auto."
      miseAJour="25 août 2026"
    >
      <BlocLegal titre="1. Objet">
        <p>
          Les présentes conditions générales d&apos;utilisation (« CGU ») régissent l&apos;accès et
          l&apos;utilisation de l&apos;application <strong>{SOCIETE.produit}</strong> (le « Service »),
          éditée par <strong>{SOCIETE.editeur}</strong>, {ADRESSE_COMPLETE}, SIRET {SOCIETE.siret}
          (l&apos;« Éditeur »). Le Service est un logiciel en ligne de gestion des dossiers de sinistres,
          de devis, de factures, de signatures et d&apos;encaissements destiné aux professionnels de la
          carrosserie et du vitrage automobile.
        </p>
        <p>
          Toute utilisation du Service implique l&apos;acceptation pleine et entière des présentes CGU.
        </p>
      </BlocLegal>

      <BlocLegal titre="2. Accès au Service">
        <p>
          Le Service est réservé aux <strong>professionnels</strong> agissant dans le cadre de leur
          activité. Les comptes sont créés par l&apos;Éditeur à la demande du client (le « Garage »),
          après démonstration et acceptation d&apos;une proposition commerciale. Un compte correspond à
          un seul établissement ; les données de chaque Garage sont cloisonnées.
        </p>
        <p>
          Le Service est accessible en ligne, 24 h/24 et 7 j/7, sauf interruption pour maintenance ou
          cas de force majeure. L&apos;Éditeur informe, dans la mesure du possible, des maintenances
          planifiées ; l&apos;état du Service est consultable à tout moment sur la page{" "}
          <a href="/etat">État du service</a>.
        </p>
      </BlocLegal>

      <BlocLegal titre="3. Compte et identifiants">
        <p>
          Le Garage est responsable de la confidentialité de ses identifiants et de toute activité
          réalisée depuis son compte. Il s&apos;engage à prévenir sans délai l&apos;Éditeur de toute
          utilisation non autorisée. Les mots de passe des extranets tiers saisis dans le Service
          sont chiffrés (AES-256) et ne sont jamais affichés en clair.
        </p>
      </BlocLegal>

      <BlocLegal titre="4. Obligations du Garage">
        <ul>
          <li>Utiliser le Service conformément à la loi et aux présentes CGU ;</li>
          <li>
            Vérifier le contenu des documents générés (devis, factures, ordres de réparation,
            cessions de créance, PV) avant leur envoi ou leur signature : ils sont établis sous sa
            seule responsabilité ;
          </li>
          <li>
            Disposer des droits nécessaires sur les données qu&apos;il saisit (coordonnées de ses
            clients, documents d&apos;expertise, photographies) et informer ses clients conformément au
            RGPD ;
          </li>
          <li>Ne pas tenter d&apos;accéder aux données d&apos;un autre Garage ni de perturber le Service.</li>
        </ul>
      </BlocLegal>

      <BlocLegal titre="5. Signature électronique">
        <p>
          Le Service permet la signature de documents à l&apos;atelier ou à distance par lien sécurisé.
          Chaque signature est horodatée et rattachée au document signé, qui est archivé au dossier.
          Il s&apos;agit d&apos;une signature électronique <strong>simple</strong> au sens du règlement
          eIDAS ; il appartient au Garage d&apos;apprécier si ce niveau convient à chaque usage.
        </p>
      </BlocLegal>

      <BlocLegal titre="6. Données et propriété">
        <p>
          Les données saisies dans le Service appartiennent au Garage. L&apos;Éditeur agit en qualité
          de <strong>sous-traitant</strong> au sens du RGPD et ne les utilise que pour fournir,
          sécuriser et améliorer le Service, dans les conditions décrites dans la{" "}
          <a href="/confidentialite">politique de confidentialité</a>. Le Garage peut à tout moment
          exporter l&apos;intégralité de ses données depuis la fonction « Sauvegarde ».
        </p>
        <p>
          Le Service, son code, son interface et sa marque restent la propriété exclusive de
          l&apos;Éditeur. Le Garage bénéficie d&apos;un droit d&apos;utilisation personnel, non exclusif et
          non cessible, pour la durée de son abonnement.
        </p>
      </BlocLegal>

      <BlocLegal titre="7. Intelligence artificielle">
        <p>
          La lecture automatique des rapports d&apos;expertise et des cartes grises s&apos;appuie sur des
          traitements algorithmiques et, en repli, sur un modèle d&apos;intelligence artificielle. Les
          résultats sont des <strong>propositions</strong> que le Garage doit contrôler avant validation.
          L&apos;Éditeur ne garantit pas l&apos;exactitude de chaque lecture.
        </p>
      </BlocLegal>

      <BlocLegal titre="8. Tarifs, durée et résiliation">
        <p>
          Les conditions financières (formule, prix, durée d&apos;engagement) figurent dans la proposition
          commerciale acceptée par le Garage. Sauf stipulation contraire, l&apos;abonnement est mensuel et
          résiliable à tout moment pour la fin du mois en cours, par simple email à{" "}
          <a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a>. À la résiliation, le Garage dispose
          de 30 jours pour exporter ses données, après quoi elles sont supprimées.
        </p>
      </BlocLegal>

      <BlocLegal titre="9. Responsabilité">
        <p>
          L&apos;Éditeur est tenu d&apos;une obligation de moyens. Il ne saurait être tenu responsable des
          dommages indirects (perte de chiffre d&apos;affaires, de clientèle ou de données résultant d&apos;un
          usage non conforme), ni des conséquences d&apos;un document envoyé sans vérification par le
          Garage. En tout état de cause, la responsabilité de l&apos;Éditeur est limitée au montant des
          sommes versées par le Garage au cours des douze derniers mois.
        </p>
      </BlocLegal>

      <BlocLegal titre="10. Assistance">
        <p>
          Une assistance est intégrée à l&apos;application (menu « Assistance ») et joignable par email à{" "}
          <a href={`mailto:${SOCIETE.email}`}>{SOCIETE.email}</a>. L&apos;Éditeur s&apos;engage à accuser
          réception de toute demande sous 24 heures ouvrées.
        </p>
      </BlocLegal>

      <BlocLegal titre="11. Modification des CGU">
        <p>
          L&apos;Éditeur peut faire évoluer les présentes CGU. Les Garages sont informés de toute
          modification substantielle par email ou dans l&apos;application au moins 30 jours avant son
          entrée en vigueur.
        </p>
      </BlocLegal>

      <BlocLegal titre="12. Droit applicable">
        <p>
          Les présentes CGU sont soumises au droit français. En cas de litige, les parties
          rechercheront une solution amiable ; à défaut, les tribunaux compétents du ressort du siège
          de l&apos;Éditeur seront seuls compétents.
        </p>
      </BlocLegal>
    </PageVitrine>
  );
}

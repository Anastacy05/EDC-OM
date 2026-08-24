import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { lireParticipation, lireDocumentOM } from "@/lib/data/om";
import { lireSession } from "@/lib/auth/garde";
import { lignesVisasVierges } from "@/lib/buildDocument";
import { formatDateFR, dureeEnJours } from "@/lib/dateUtils";
import { numeroCommeImprime, numeroPourGabarit } from "@/lib/numeroOM";
import { titrePageClass, carteClass, conteneurFormClass } from "@/lib/styles";
import type { OrdreMissionDocument } from "@/types/om";
import RetourVers from "@/components/RetourVers";
import OMPreview from "@/components/OMPreview";
import BadgeStatut from "../BadgeStatut";
import BlocActions from "./BlocActions";
import BoutonTelecharger from "./BoutonTelecharger";

/**
 * Détail d'un ordre de mission, pour UN participant.
 *
 * ── Composant serveur ────────────────────────────────────────────────────────
 *
 * `useEstMonte` disparaît, et c'est le point. Il n'existait que pour masquer une
 * discordance d'hydratation : `mockOMs` valait les données par défaut au rendu
 * serveur et celles de `localStorage` côté navigateur, si bien qu'un OM créé par
 * l'utilisateur était « introuvable » côté serveur et trouvé côté client. La page
 * affichait donc un écran de chargement à chaque visite pour contourner un défaut
 * qui n'existe plus dès que la donnée vient de la base.
 *
 * ── Le participant est choisi par MATRICULE, pas par index ───────────────────
 *
 * L'ancien écran naviguait entre les participants avec un index de tableau et un
 * `?participant=<id>` où l'`id` était une clé de démonstration. La table n'a pas
 * d'identifiant de substitution : sa clé primaire est le couple
 * `(id_ordre_mission, matricule)`. L'URL porte donc le matricule, ce qui la rend
 * stable et partageable — et surtout, c'est la valeur sur laquelle la garde
 * d'autorisation travaille.
 */

interface Parametres {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ participant?: string; cree?: string; conflits?: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Ordre de mission ${id} — EDC OM` };
}

export default async function OMDetailPage({ params, searchParams }: Parametres) {
  const { id } = await params;
  const { participant: matriculeVoulu, cree, conflits } = await searchParams;

  const session = await lireSession();
  if (!session) notFound();

  // Le matricule demandé, ou celui de la session à défaut. Une chaîne vide signifie
  // « la mission, par son premier participant » : c'est le cas d'un administrateur,
  // qui n'a pas de matricule, et celui de la redirection qui suit une création.
  const matricule = matriculeVoulu?.trim() || session.matricule || "";

  // La lecture est ouverte à tout compte authentifié (décision du 24/08/2026) : un
  // agent doit pouvoir ouvrir la fiche d'un collègue pour en télécharger le
  // document. Ce sont les ACTIONS qui restent réservées à l'administrateur, plus
  // bas — `BlocActions` n'est rendu que pour lui, et chaque fonction du DAL porte
  // sa propre garde.
  const detail = await lireParticipation(id, matricule);

  // Un administrateur sans paramètre : on prend le premier participant de la
  // mission. `notFound()` sinon — mission inexistante, ou dont l'appelant ne fait
  // pas partie. Les deux cas se ressemblent VOLONTAIREMENT : distinguer
  // « n'existe pas » de « pas à vous » révélerait l'existence de la mission.
  if (!detail || detail.participants.length === 0) notFound();

  const courant =
    detail.participants.find((p) => p.matricule === matricule) ?? detail.participants[0];

  const document = await lireDocumentOM(id, courant.matricule);
  if (!document) notFound();

  const duree = dureeEnJours(detail.dateDepart, detail.dateRetour);
  const bloque = courant.blocageMotif !== null;

  // Le fac-similé attend l'objet plat des balises du gabarit. `null` devient
  // `undefined` : le type du document est optionnel partout, et un `null` s'y
  // afficherait littéralement.
  const apercu: OrdreMissionDocument = {
    // Le COMPTEUR seul : `OMPreview` recompose « /EDC/DG/DRH/SDARHAS » comme le
    // gabarit. Passer la valeur stockée afficherait l'année au milieu du suffixe.
    numeroOM: numeroPourGabarit(document.numeroOM),
    nom: document.nom,
    prenoms: document.prenoms,
    grade: document.grade ?? undefined,
    affectation: document.affectation,
    matricule: document.matricule,
    situationFamille: document.situationFamille ?? undefined,
    indice: document.indice ?? undefined,
    destination: document.destination,
    viaPassage: document.viaPassage ?? undefined,
    // La MENTION est préfixée au motif, comme sur le document imprimé : le gabarit
    // n'a pas de balise dédiée, et l'aperçu doit montrer ce qui sera imprimé.
    motif: document.mentionStatut
      ? `${document.mentionStatut}${document.motif ? ` — ${document.motif}` : ""}`
      : document.motif ?? undefined,
    financement: document.financement ?? undefined,
    moyenTransport: document.moyenTransport ?? undefined,
    dateDepart: document.dateDepart,
    dateRetour: document.dateRetour,
    nomEmetteur: document.nomEmetteur,
    gradeEmetteur: document.gradeEmetteur ?? undefined,
    fonctionEmetteur: document.fonctionEmetteur,
    lieuEmission: document.lieuEmission,
    dateEmission: document.dateEmission,
    chapitre: document.chapitre ?? undefined,
    article: document.article ?? undefined,
    paragraphe: document.paragraphe ?? undefined,
    exercice: document.exercice ?? undefined,
    exerciceAnnee: document.exerciceAnnee ?? undefined,
    visas: lignesVisasVierges(),
  };

  return (
    <div className={`${conteneurFormClass} gap-4`}>
      <RetourVers href="/om" libelle="Retour à la liste des ordres de mission" />
      <h1 className={titrePageClass}>Ordre de mission {courant.numeroOM}</h1>

      {/* Confirmation d'enregistrement. `existant` : le même brouillon a été
          renvoyé (double-clic, reprise après coupure) et l'ULID a évité le
          doublon — le dire évite que l'utilisateur croie avoir créé deux OM. */}
      {cree && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          {cree === "existant"
            ? "Cet ordre de mission avait déjà été enregistré : votre second envoi n'a créé aucun doublon."
            : "Ordre de mission enregistré. Les numéros sont définitifs — le document peut partir à la signature."}
        </p>
      )}

      {conflits && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            <strong>
              {conflits} chevauchement{Number(conflits) > 1 ? "s" : ""} avec un ordre de
              mission en attente.
            </strong>{" "}
            Aucun des deux n&apos;est confirmé, donc rien n&apos;est bloqué : c&apos;est
            l&apos;administrateur qui arbitrera à la confirmation. L&apos;auteur de
            l&apos;autre mission en a été averti.
          </p>
        </div>
      )}

      {/* Navigation entre participants — par matricule, pas par index. Chaque
          entrée est un LIEN : la page reste serveur, l'adresse est partageable,
          et le bouton « précédent » du navigateur fait ce qu'on attend. */}
      {detail.participants.length > 1 && (
        <nav aria-label="Participants de la mission" className={`${carteClass} flex flex-wrap gap-2`}>
          {detail.participants.map((p) => {
            const actif = p.matricule === courant.matricule;
            return (
              <Link
                key={p.matricule}
                href={`/om/${id}?participant=${encodeURIComponent(p.matricule)}`}
                aria-current={actif ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm
                            transition-colors duration-200 ${
                              actif
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-blue-300 bg-white text-blue-900 hover:bg-blue-50"
                            }`}
              >
                {p.nom} {p.prenoms}
                {p.blocageMotif && (
                  <AlertTriangle size={13} aria-label="en conflit" className="shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Le résumé : ce qu'on veut savoir sans lire le fac-similé. */}
      <div className={`${carteClass} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <BadgeStatut statut={courant.statut} bloque={bloque} />
          <span className="text-sm text-slate-600">
            Sur le document :{" "}
            <strong className="font-mono">N° {numeroCommeImprime(courant.numeroOM)}</strong>
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Ligne terme="Agent">
            {courant.nom} {courant.prenoms}{" "}
            <span className="font-mono text-xs text-slate-500">{courant.matricule}</span>
          </Ligne>
          <Ligne terme="Fonction à l'émission">{courant.fonction}</Ligne>
          <Ligne terme="Destination">{detail.paysDestination}, {detail.villeDestination}</Ligne>
          <Ligne terme="Période">
            du {formatDateFR(detail.dateDepart)} au {formatDateFR(detail.dateRetour)}
            {duree !== null && ` (${duree} j.)`}
          </Ligne>
          <Ligne terme="Indemnité journalière">
            {courant.montantFraisFixeJournalier === null ? (
              <span className="text-amber-800">Non calculée</span>
            ) : (
              <>
                {courant.montantFraisFixeJournalier.toLocaleString("fr-FR")} FCFA
                {duree !== null && (
                  <span className="text-slate-500">
                    {" "}
                    — soit{" "}
                    {(courant.montantFraisFixeJournalier * duree).toLocaleString("fr-FR")} FCFA
                  </span>
                )}
              </>
            )}
          </Ligne>
          <Ligne terme="Motif">{detail.motif}</Ligne>
        </dl>

        {/* Le montant est FIGÉ à l'émission : le dire, sinon un écart avec le
            barème courant passerait pour une erreur d'affichage. */}
        <p className="text-xs text-slate-500">
          L&apos;indemnité est celle du barème au jour de l&apos;émission. Elle n&apos;est
          jamais recalculée : un montant qui changerait après signature ne
          correspondrait plus au document signé.
        </p>
      </div>

      {/* Les actions sont réservées à l'administrateur. Un agent consulte et
          télécharge — c'est la règle du DAL, répétée ici pour ne pas afficher des
          boutons qui échoueraient tous. */}
      {session.role === "ADMINISTRATEUR" && (
        <div className={carteClass}>
          <BlocActions
            idOM={detail.id}
            matricule={courant.matricule}
            statut={courant.statut}
            bloque={bloque}
            expire={courant.statut === "EXPIRE"}
          />
        </div>
      )}

      {/* Le fac-similé, fidèle au document Word — lecture seule. */}
      <div className="mt-6">
        <OMPreview om={apercu} />
      </div>

      <div className="mt-6 flex justify-center">
        <BoutonTelecharger
          idOM={detail.id}
          matricule={courant.matricule}
          numeroOM={courant.numeroOM}
        />
      </div>
    </div>
  );
}

/** Une paire terme/définition de la fiche. */
function Ligne({ terme, children }: { terme: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{terme}</dt>
      <dd className="text-blue-950">{children}</dd>
    </div>
  );
}

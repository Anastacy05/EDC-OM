"use client";

import { useState, useEffect, useMemo, useActionState } from "react";
import { useRouter } from "next/navigation";
import { ulid } from "ulid";
import { Trash2, UserPlus, AlertTriangle, X } from "lucide-react";
import { villesDuPays } from "@/lib/locations";
import { useBrouillonNonEnregistre } from "@/contexts/brouillonContext";
import {
  inputClass,
  carteClass as fieldsetClass,
  legendClass,
  titrePageClass,
  boutonPrimaire,
  boutonSecondaire,
  conteneurFormClass,
  conteneurLargeClass,
} from "@/lib/styles";
import AutocompleteInput from "@/components/AutocompleteInput";
import Confirmation from "@/components/Confirmation";
import OMPreview from "@/components/OMPreview";
import RetourVers from "@/components/RetourVers";
import { lignesVisasVierges } from "@/lib/buildDocument";
import { formatDateFR } from "@/lib/dateUtils";
import type { OrdreMissionDocument } from "@/types/om";
import {
  validerOM,
  EMETTEUR,
  MAX_PARTICIPANTS,
  type SaisieOM,
  type ErreursChampsOM,
} from "@/lib/data/om.validation";
import { actionCreerOM, type EtatFormulaireOM } from "@/app/om/actions";
import type { DonneesFormulaireOM } from "@/lib/data/om";

/**
 * Formulaire de création d'un ordre de mission.
 *
 * ── Ce qui change, et pourquoi ───────────────────────────────────────────────
 *
 * Le composant reste CLIENT : il a besoin d'interactivité (ajout de participants,
 * cascade pays → ville, aperçu avant enregistrement). Mais tout ce qu'il lisait
 * dans des tableaux en dur lui arrive maintenant en props, depuis une enveloppe
 * serveur : employés actifs, zones, barème, âge de retraite.
 *
 *   • `mockEmployees` → `donnees.employes` : la liste vient de la base, et ne
 *     contient QUE les employés actifs. Un employé désactivé n'est donc plus
 *     proposé, alors qu'il l'était et que l'OM aurait été refusé à l'écriture.
 *   • `zoneDuPaysFr` / `montantFraisFixe` → `donnees.zoneParPays` / `donnees.bareme` :
 *     la classification des zones est une décision de barème, corrigible par les RH
 *     sans redéploiement.
 *   • `addMockOM` → `actionCreerOM` : l'enregistrement passe par le serveur, dans
 *     une transaction.
 *
 * ── Les numéros ne sont plus calculés à l'aperçu ─────────────────────────────
 *
 * `genererProchainNumeroOM` produisait un numéro côté navigateur, affiché dans
 * l'aperçu, puis enregistré. Deux postes obtenaient donc les MÊMES numéros. Ils sont
 * maintenant attribués par le serveur, à l'enregistrement, depuis une plage
 * réservée — l'aperçu annonce donc « attribué à l'enregistrement » plutôt que de
 * montrer une valeur qui ne sera pas celle du document.
 *
 * ── L'ULID est produit ICI, côté navigateur ──────────────────────────────────
 *
 * Clé d'idempotence : un double-clic sur « Enregistrer », ou un renvoi après
 * coupure réseau, ne crée pas deux missions numérotées. C'est aussi le chemin de
 * l'étape 11, où la création sera hors ligne et où le serveur ne pourra pas la
 * fournir.
 */

const MOYENS_TRANSPORT = ["Avion", "Train", "Bus", "Voiture de service"];
const gridClass = "grid grid-cols-1 sm:grid-cols-2 gap-4";

/**
 * Message d'erreur sous un champ.
 *
 * Défini AU NIVEAU DU MODULE et non dans le rendu du formulaire. Un composant créé
 * pendant le rendu a une identité neuve à chaque passe : React démonte alors son
 * sous-arbre et le remonte au lieu de le mettre à jour. Sur un simple paragraphe
 * l'effet est discret, mais c'est aussi ce qui ferait perdre le focus ou l'état d'un
 * champ si l'on étendait ce motif — d'où la règle `react-hooks/static-components`.
 *
 * Il reçoit donc le MESSAGE, pas la clé : il n'a plus à lire l'état du parent.
 */
function Erreur({ message }: { message?: string }) {
  if (!message) return null;
  // `role="alert"` : sans lui, un message apparu après validation n'est pas annoncé
  // par un lecteur d'écran, et l'utilisateur croit que rien ne s'est passé.
  return (
    <p role="alert" className="mt-1 text-xs text-red-700">
      {message}
    </p>
  );
}

/** Un participant retenu, avec l'instantané de sa situation au moment de la saisie. */
type Participant = DonneesFormulaireOM["employes"][number];

export default function FormulaireOM({ donnees }: { donnees: DonneesFormulaireOM }) {
  const { activer: signalerBrouillon, desactiver: effacerBrouillon } =
    useBrouillonNonEnregistre();
  const router = useRouter();

  /**
   * ULID, produit à la VALIDATION et conservé en état.
   *
   * ── Trois tentatives, et pourquoi seule la troisième tient ─────────────────
   *
   *   • `useState(() => ulid())` s'exécute AUSSI au rendu serveur : serveur et
   *     navigateur produiraient deux valeurs pour le même champ, donc une
   *     discordance d'hydratation.
   *   • `useEffect(() => setCle(ulid()))` corrige ça mais déclenche un second rendu
   *     immédiat pour une valeur sans effet visuel — `react-hooks/set-state-in-effect`.
   *   • une référence lue au rendu est refusée aussi, et à juste titre
   *     (`react-hooks/refs`) : une valeur qui pilote l'affichage — ici l'état
   *     `disabled` du bouton — doit être de l'état, sinon React ne sait pas qu'il
   *     faut réafficher.
   *
   * La réponse est donc de la produire dans un GESTIONNAIRE D'ÉVÉNEMENT : `valider()`
   * ne tourne que côté navigateur, après un clic. Pas d'hydratation en jeu, pas de
   * rendu superflu.
   *
   * ⚠️ Conservée d'un aller-retour à l'autre : revenir à la saisie puis renvoyer doit
   * réutiliser LA MÊME clé, sinon une seconde tentative après échec créerait un
   * doublon au lieu d'être reconnue comme le même envoi.
   */
  const [cleIdempotence, setCleIdempotence] = useState("");

  const [paysDestination, setPaysDestination] = useState("");
  const [villeDestination, setVilleDestination] = useState("");
  const [viaPassage] = useState(""); // COMMENTÉ ci-dessous : champ non saisi
  const [motif, setMotif] = useState("");
  const [financement, setFinancement] = useState("");
  const [moyenTransport, setMoyenTransport] = useState("");
  const [dateDepart, setDateDepart] = useState("");
  const [dateRetour, setDateRetour] = useState("");
  const [lieuEmission, setLieuEmission] = useState("Yaoundé");
  const [dateEmission, setDateEmission] = useState("");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matriculeSaisi, setMatriculeSaisi] = useState("");
  const [nomSaisi, setNomSaisi] = useState("");
  const [erreurAjout, setErreurAjout] = useState("");

  const [etape, setEtape] = useState<"formulaire" | "apercu">("formulaire");
  const [erreursChamps, setErreursChamps] = useState<ErreursChampsOM>({});
  /** Question posée par le bouton « Annuler ». */
  const [questionAbandon, setQuestionAbandon] = useState(false);

  const [etatServeur, enregistrer, enregistrementEnCours] = useActionState(
    actionCreerOM,
    undefined as EtatFormulaireOM | undefined
  );

  // Le garde-fou de brouillon se déclenche dès qu'il y a de la matière à perdre.
  useEffect(() => {
    if (participants.length > 0) signalerBrouillon();
    else effacerBrouillon();
  }, [participants.length, signalerBrouillon, effacerBrouillon]);

  // Toujours désactivé en quittant la page, quelle que soit la raison — sinon un
  // brouillon abandonné ici déclencherait la confirmation sur une tout autre page.
  useEffect(() => () => effacerBrouillon(), [effacerBrouillon]);

  /**
   * Vrai s'il y a quelque chose à perdre en quittant.
   *
   * Plus large que `signalerBrouillon`, qui ne regarde que les participants :
   * quelqu'un qui a saisi une destination, un motif et des dates sans avoir encore
   * ajouté de participant a bien travaillé, et le lui faire perdre sans question
   * serait le même défaut. À l'inverse, un formulaire intact ne pose aucune
   * question — `lieuEmission` est préréglé et ne compte donc pas.
   */
  const aDeLaMatiere =
    participants.length > 0 ||
    [paysDestination, villeDestination, motif, financement, moyenTransport, dateDepart, dateRetour, dateEmission]
      .some((v) => v.trim() !== "");

  /** Abandonne la saisie et retourne à la liste. */
  const quitterSansEnregistrer = () => {
    effacerBrouillon();
    router.push("/om");
  };

  // ── Dérivés ───────────────────────────────────────────────────────────────

  // `useMemo` nécessaire : AutocompleteInput met en cache les formes normalisées
  // dans une WeakMap indexée par la RÉFÉRENCE du tableau, qu'un tableau recréé à
  // chaque rendu invaliderait — le cache ne servirait alors jamais.
  const suggestionsMatricules = useMemo(
    () => donnees.employes.map((e) => e.matricule),
    [donnees.employes]
  );
  const suggestionsNoms = useMemo(
    () => donnees.employes.map((e) => `${e.nom} ${e.prenoms}`),
    [donnees.employes]
  );
  const nomsPays = useMemo(() => Object.keys(donnees.zoneParPays), [donnees.zoneParPays]);
  const villesDuPaysChoisi = useMemo(() => villesDuPays(paysDestination), [paysDestination]);
  const villesCameroun = useMemo(() => villesDuPays("Cameroun"), []);

  // Zone de destination : `undefined` tant que le pays n'est pas exactement l'un de
  // ceux du référentiel. On ne devine PAS — un montant calculé sur une zone devinée
  // serait faux sur un document signé.
  const zone = donnees.zoneParPays[paysDestination.trim()];
  const zoneConnue = zone !== undefined;

  const montantDe = (codeStatut: string): number | undefined =>
    zoneConnue ? donnees.bareme[codeStatut]?.[String(zone)] : undefined;

  /**
   * La saisie courante, au format attendu par la validation.
   *
   * `cle` est passée en paramètre plutôt que lue depuis l'état : `valider()` produit
   * l'ULID et appelle cette fonction dans le même tour, or l'état ne sera à jour
   * qu'au rendu suivant. Le lire ici renverrait la valeur précédente — vide au
   * premier passage, donc une erreur de validation sur un champ correct.
   */
  const saisie = (cle: string): SaisieOM => ({
    ulid: cle,
    paysDestination,
    villeDestination,
    viaPassage,
    motif,
    financement,
    moyenTransport,
    dateDepart,
    dateRetour,
    lieuEmission,
    dateEmission,
    matricules: participants.map((p) => p.matricule),
  });

  // ── Participants ──────────────────────────────────────────────────────────

  const handleMatriculeSaisi = (valeur: string) => {
    setMatriculeSaisi(valeur);
    const employe = donnees.employes.find(
      (e) => e.matricule.toUpperCase() === valeur.trim().toUpperCase()
    );
    if (employe) setNomSaisi(`${employe.nom} ${employe.prenoms}`);
  };

  const handleNomSaisi = (valeur: string) => {
    setNomSaisi(valeur);
    const employe = donnees.employes.find((e) => `${e.nom} ${e.prenoms}` === valeur);
    if (employe) setMatriculeSaisi(employe.matricule);
  };

  const ajouterParticipant = () => {
    setErreurAjout("");
    const employe =
      donnees.employes.find(
        (e) => e.matricule.toUpperCase() === matriculeSaisi.trim().toUpperCase()
      ) ?? donnees.employes.find((e) => `${e.nom} ${e.prenoms}` === nomSaisi);

    if (!employe) {
      // Le message dit explicitement « actif » : un employé désactivé n'est plus
      // dans la liste, et sans cette précision l'utilisateur croirait à une faute
      // de frappe alors que la fiche existe.
      setErreurAjout(
        "Aucun employé ACTIF ne correspond à ce matricule ou ce nom. Un employé " +
          "désactivé ne peut pas partir en mission — réactivez sa fiche si c'est une erreur."
      );
      return;
    }
    if (participants.some((p) => p.matricule === employe.matricule)) {
      setErreurAjout("Cet employé est déjà dans la liste.");
      return;
    }
    if (participants.length >= MAX_PARTICIPANTS) {
      setErreurAjout(
        `${MAX_PARTICIPANTS} participants au maximum : chacun consomme un numéro d'OM définitif.`
      );
      return;
    }

    setParticipants((prev) => [...prev, employe]);
    setMatriculeSaisi("");
    setNomSaisi("");
  };

  const retirerParticipant = (matricule: string) =>
    setParticipants((prev) => prev.filter((p) => p.matricule !== matricule));

  // ── Validation puis aperçu ────────────────────────────────────────────────

  const valider = () => {
    // ⚠️ La MÊME fonction que le serveur (`lib/data/om.validation.ts`). Elle ne
    // protège rien ici — l'action la rejoue — mais elle garantit que l'utilisateur
    // voit les mêmes règles que celles qui s'appliqueront, au lieu d'une
    // approximation qui divergerait à la première correction.
    //
    // L'ULID est produit ici, au clic : la clé existante est réutilisée si l'on
    // repasse par la saisie, pour qu'une seconde tentative reste le même envoi.
    const cle = cleIdempotence || ulid();
    if (cle !== cleIdempotence) setCleIdempotence(cle);

    const { valide, erreurs } = validerOM(saisie(cle), {
      paysConnus: new Set(nomsPays),
    });

    setErreursChamps(erreurs);
    if (!valide) {
      // Défilement vers le premier champ en erreur, après le rendu.
      setTimeout(() => {
        document.querySelector('[data-error="true"]')?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 50);
      return;
    }

    setEtape("apercu");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const revenirAuFormulaire = () => {
    setEtape("formulaire");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  /** Document d'aperçu pour un participant. Le numéro n'est pas encore connu. */
  const apercuDe = (p: Participant): OrdreMissionDocument => ({
    // Le serveur attribuera le numéro depuis une plage réservée. Afficher une
    // valeur inventée ici serait pire que ne rien afficher : l'utilisateur
    // croirait connaître le numéro de la pièce.
    numeroOM: "— attribué à l'enregistrement —",
    nom: p.nom,
    prenoms: p.prenoms,
    grade: p.grade ?? undefined,
    affectation: p.codeDepartement,
    matricule: p.matricule,
    // La situation de famille n'est pas envoyée au navigateur (donnée personnelle
    // non nécessaire à la saisie) : le document imprimé la portera, elle est figée
    // par le serveur depuis la fiche.
    situationFamille: p.situationFamille ?? "",
    indice: "",
    destination: villeDestination
      ? `${paysDestination}, ${villeDestination}`
      : paysDestination,
    viaPassage,
    motif,
    financement,
    moyenTransport,
    dateDepart,
    dateRetour,
    nomEmetteur: EMETTEUR.nom,
    gradeEmetteur: EMETTEUR.grade ?? undefined,
    fonctionEmetteur: EMETTEUR.fonction,
    lieuEmission,
    dateEmission,
    visas: lignesVisasVierges(),
  });

  // ── Rendu : étape APERÇU ──────────────────────────────────────────────────

  if (etape === "apercu") {
    return (
      <div className={`${conteneurLargeClass} gap-8`}>
        <h1 className={titrePageClass}>
          Aperçu — {participants.length} document{participants.length > 1 ? "s" : ""}
        </h1>

        {etatServeur?.erreur && (
          <p
            role="alert"
            className="mx-auto w-full max-w-4xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            {etatServeur.erreur}
          </p>
        )}

        <div className="mx-auto flex w-full max-w-4xl items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            Les numéros d&apos;ordre de mission sont attribués <strong>à
            l&apos;enregistrement</strong>, par le serveur, depuis une plage réservée. Ils
            sont alors <strong>définitifs</strong> : le document peut partir à la
            signature sans risque de renumérotation. Le conflit de période est vérifié
            au même instant, sur l&apos;ensemble de la base.
          </p>
        </div>

        {participants.map((p) => (
          <div key={p.matricule} className="flex flex-col gap-2">
            <p className="mx-auto w-full max-w-4xl text-sm text-amber-800">
              {p.nom} {p.prenoms} — {p.libelleStatut}
              {montantDe(p.codeStatut) !== undefined && (
                <> — indemnité journalière : {montantDe(p.codeStatut)!.toLocaleString("fr-FR")} FCFA</>
              )}
            </p>
            <OMPreview om={apercuDe(p)} />
          </div>
        ))}

        {/* Le formulaire de soumission : tous les champs sont CACHÉS, l'aperçu ayant
            déjà montré leur contenu. Un vrai `<form action={…}>` plutôt qu'un
            `onClick` — le navigateur gère alors l'envoi, y compris sans JavaScript
            une fois hydraté, et `useActionState` reçoit l'état de retour. */}
        <form action={enregistrer} className="flex flex-wrap justify-center gap-4">
          <input type="hidden" name="ulid" value={cleIdempotence} />
          <input type="hidden" name="paysDestination" value={paysDestination} />
          <input type="hidden" name="villeDestination" value={villeDestination} />
          <input type="hidden" name="viaPassage" value={viaPassage} />
          <input type="hidden" name="motif" value={motif} />
          <input type="hidden" name="financement" value={financement} />
          <input type="hidden" name="moyenTransport" value={moyenTransport} />
          <input type="hidden" name="dateDepart" value={dateDepart} />
          <input type="hidden" name="dateRetour" value={dateRetour} />
          <input type="hidden" name="lieuEmission" value={lieuEmission} />
          <input type="hidden" name="dateEmission" value={dateEmission} />
          {/* Un champ par participant, tous nommés « matricules » : c'est ce que
              `formData.getAll("matricules")` relit côté serveur. */}
          {participants.map((p) => (
            <input key={p.matricule} type="hidden" name="matricules" value={p.matricule} />
          ))}

          <button
            type="button"
            onClick={revenirAuFormulaire}
            disabled={enregistrementEnCours}
            className={`${boutonSecondaire} disabled:opacity-40`}
          >
            Revenir à la saisie
          </button>
          <button
            type="submit"
            disabled={enregistrementEnCours || !cleIdempotence}
            className={`${boutonPrimaire} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {enregistrementEnCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </div>
    );
  }

  // ── Rendu : étape FORMULAIRE ──────────────────────────────────────────────

  /** Attribut `data-error`, pour le défilement vers le premier champ fautif. */
  const marque = (cle: keyof ErreursChampsOM) =>
    erreursChamps[cle] ? ("true" as const) : undefined;

  return (
    <div className="min-h-full w-full bg-blue-50">
      <div className={`${conteneurFormClass} gap-8`}>
        <RetourVers
          href="/om"
          libelle="Retour à la liste des ordres de mission"
          protegerBrouillon
        />

        <h1 className={titrePageClass}>Nouvel ordre de mission</h1>

        {/* L'erreur d'ULID vise l'équipe technique : aucune saisie ne peut la
            produire, le champ étant caché et rempli par le navigateur. */}
        <Erreur message={erreursChamps.ulid} />

        {etatServeur?.erreur && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {etatServeur.erreur}
          </p>
        )}

        {/* ── Participants ──────────────────────────────────────────────── */}
        <fieldset className={fieldsetClass} data-error={marque("matricules")}>
          <legend className={legendClass}>Participants</legend>

          <div className="flex flex-wrap gap-2">
            <div className="min-w-48 flex-1">
              <AutocompleteInput
                placeholder="Matricule de l'employé"
                value={matriculeSaisi}
                onChange={handleMatriculeSaisi}
                suggestions={suggestionsMatricules}
              />
            </div>
            <div className="min-w-48 flex-1">
              <AutocompleteInput
                placeholder="Nom de l'employé"
                value={nomSaisi}
                onChange={handleNomSaisi}
                suggestions={suggestionsNoms}
              />
            </div>
            <button type="button" onClick={ajouterParticipant} className={boutonSecondaire}>
              <UserPlus size={18} aria-hidden="true" />
              Ajouter
            </button>
          </div>

          {erreurAjout && (
            <p role="alert" className="text-sm text-red-700">
              {erreurAjout}
            </p>
          )}
          <Erreur message={erreursChamps.matricules} />

          <p className="text-xs text-slate-500">
            Seuls les employés actifs sont proposés. Chaque participant reçoit son
            propre document, avec son propre numéro.
          </p>

          {participants.map((p) => {
            const montant = montantDe(p.codeStatut);
            return (
              <div
                key={p.matricule}
                className="flex items-start justify-between gap-4 rounded-xl border border-blue-100 p-4"
              >
                <div>
                  <p className="font-medium text-blue-800">
                    {p.nom} {p.prenoms}
                  </p>
                  <p className="text-sm text-gray-600">
                    {p.libelleStatut} — {p.fonction} —{" "}
                    <span className="font-mono">{p.matricule}</span>
                  </p>
                  {/* Le montant ne peut être connu qu'une fois la destination
                      choisie (donc la zone). Les trois cas sont distincts, et le
                      troisième doit être VISIBLE : un barème manquant fait échouer
                      l'enregistrement, autant le savoir avant. */}
                  <p className="text-sm text-amber-700">
                    {!zoneConnue
                      ? "Indemnité journalière : à déterminer une fois la destination choisie"
                      : montant !== undefined
                        ? `Indemnité journalière (indicative) : ${montant.toLocaleString("fr-FR")} FCFA`
                        : `Aucun barème pour le statut « ${p.libelleStatut} » sur cette zone — l'enregistrement sera refusé.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => retirerParticipant(p.matricule)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-700
                             transition-colors duration-200 hover:bg-red-50"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  <span aria-hidden="true">Retirer</span>
                  <span className="sr-only">
                    Retirer {p.nom} {p.prenoms} de la mission
                  </span>
                </button>
              </div>
            );
          })}
        </fieldset>

        {/* ── Mission ───────────────────────────────────────────────────── */}
        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>Détails de la mission</legend>

          <div className={gridClass}>
            <div data-error={marque("paysDestination")}>
              <AutocompleteInput
                placeholder="Pays de destination"
                value={paysDestination}
                onChange={(v) => {
                  setPaysDestination(v);
                  // Le pays change : la ville choisie n'appartient plus à ce pays.
                  setVilleDestination("");
                }}
                suggestions={nomsPays}
              />
              <Erreur message={erreursChamps.paysDestination} />
            </div>

            <div data-error={marque("villeDestination")}>
              {/* Facultative depuis le 24/08/2026 : c'est le PAYS qui donne la
                  zone, donc l'indemnité. Le placeholder le dit, plutôt qu'un
                  astérisque en creux que personne ne remarque. */}
              <AutocompleteInput
                placeholder={
                  paysDestination
                    ? "Ville de destination (facultative)"
                    : "Choisissez d'abord un pays"
                }
                value={villeDestination}
                onChange={setVilleDestination}
                suggestions={villesDuPaysChoisi}
                disabled={!paysDestination}
              />
              <Erreur message={erreursChamps.villeDestination} />
            </div>
          </div>

          {paysDestination && (
            <p className="text-sm text-amber-700">
              {zoneConnue
                ? donnees.libellesZones[String(zone)]
                : "Pays non reconnu — choisissez-le dans les suggestions pour déterminer la zone."}
            </p>
          )}

          <div data-error={marque("motif")}>
            {/* Facultatif depuis le 24/08/2026 : le gabarit imprime « Motif et
                références » suivi d'une ligne à compléter, qui se remplit au
                stylo. L'exiger poussait à taper « RAS ». */}
            <textarea
              placeholder="Motif et références de la mission (facultatif)"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              className={`${inputClass} min-h-24 w-full`}
            />
            <Erreur message={erreursChamps.motif} />
          </div>

          <div className={gridClass}>
            <div data-error={marque("financement")}>
              <input
                placeholder="Financement"
                value={financement}
                onChange={(e) => setFinancement(e.target.value)}
                className={inputClass}
              />
              <Erreur message={erreursChamps.financement} />
            </div>

            <div data-error={marque("moyenTransport")}>
              <AutocompleteInput
                placeholder="Moyen de transport"
                value={moyenTransport}
                onChange={setMoyenTransport}
                suggestions={MOYENS_TRANSPORT}
              />
              <Erreur message={erreursChamps.moyenTransport} />
            </div>

            <label
              className="flex flex-col gap-1 text-sm text-amber-700"
              data-error={marque("dateDepart")}
            >
              Date de départ
              {/* `min` : le navigateur grise les jours passés, au lieu de laisser
                  saisir une date que la validation refusera. La valeur vient du
                  SERVEUR (`donnees.dateMinimum`) et non d'un `new Date()` local —
                  les deux « aujourd'hui » doivent être le même, sinon l'écran
                  proposerait ce que le serveur rejette. Le contrôle reste
                  rejoué à l'enregistrement : `min` est du confort, pas une garde. */}
              <input
                type="date"
                min={donnees.dateMinimum}
                value={dateDepart}
                onChange={(e) => setDateDepart(e.target.value)}
                className={`${inputClass} ${erreursChamps.dateDepart ? "border-red-500" : ""}`}
              />
              <Erreur message={erreursChamps.dateDepart} />
            </label>

            <label
              className="flex flex-col gap-1 text-sm text-amber-700"
              data-error={marque("dateRetour")}
            >
              Date de retour
              {/* Le retour ne peut précéder le départ : le plancher est le départ
                  dès qu'il est saisi, aujourd'hui sinon. */}
              <input
                type="date"
                min={dateDepart || donnees.dateMinimum}
                value={dateRetour}
                onChange={(e) => setDateRetour(e.target.value)}
                className={`${inputClass} ${erreursChamps.dateRetour ? "border-red-500" : ""}`}
              />
              <Erreur message={erreursChamps.dateRetour} />
            </label>
          </div>

          {/* La durée s'affiche dès que les deux dates sont là : c'est elle qui
              multiplie l'indemnité, donc l'information que l'utilisateur vérifie. */}
          {dateDepart && dateRetour && dateRetour >= dateDepart && (
            <p className="text-sm text-slate-600">
              Du {formatDateFR(dateDepart)} au {formatDateFR(dateRetour)} — durée
              calendaire, week-ends et jours fériés compris.
            </p>
          )}
        </fieldset>

        {/* ── Émission ──────────────────────────────────────────────────── */}
        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>Émission</legend>

          <div className={gridClass}>
            <div data-error={marque("lieuEmission")}>
              <AutocompleteInput
                placeholder="Lieu d'émission"
                value={lieuEmission}
                onChange={setLieuEmission}
                suggestions={villesCameroun}
              />
              <Erreur message={erreursChamps.lieuEmission} />
            </div>

            <label
              className="flex flex-col gap-1 text-sm text-amber-700"
              data-error={marque("dateEmission")}
            >
              Date d&apos;émission
              <input
                type="date"
                value={dateEmission}
                onChange={(e) => setDateEmission(e.target.value)}
                className={`${inputClass} ${erreursChamps.dateEmission ? "border-red-500" : ""}`}
              />
              <Erreur message={erreursChamps.dateEmission} />
            </label>
          </div>

          {/* L'émetteur est figé : les normes veulent que tout OM de l'EDC désigne le
              Directeur général, quel que soit l'agent qui l'établit. Ce n'est donc
              pas un champ, et le montrer évite qu'on le cherche. */}
          <p className="text-xs text-slate-500">
            Émetteur : <strong>{EMETTEUR.fonction}</strong> — figé par les normes de
            l&apos;EDC, quel que soit l&apos;agent qui établit l&apos;ordre.
          </p>
        </fieldset>

        {/* ── Abandon et validation ───────────────────────────────────────
            COMMENTÉ (23/08/2026), RÉTABLI AUTREMENT (24/08/2026) — l'ancien
            bouton « Annuler » appelait `handleAnnulerBrouillon`, qui remettait
            `etape` à « formulaire », c'est-à-dire à sa valeur courante. Il ne
            faisait donc RIEN tout en occupant le rang visuel d'une action
            destructrice, et il avait été retiré pour cette raison.
            <button onClick={handleAnnulerBrouillon}>Annuler</button>

            Il revient parce que le besoin était réel, mais avec un effet qui
            existe : abandonner la saisie et retourner à la liste. Il demande
            confirmation dès qu'il y a de la matière à perdre, et ne la demande
            pas quand le formulaire est vide — une question sans enjeu apprend à
            cliquer « oui » sans lire. */}
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (aDeLaMatiere) setQuestionAbandon(true);
              else quitterSansEnregistrer();
            }}
            className={boutonSecondaire}
          >
            <X size={18} aria-hidden="true" />
            Annuler
          </button>
          <button type="button" onClick={valider} className={boutonPrimaire}>
            Valider et prévisualiser
          </button>
        </div>

        <Confirmation
          ouvert={questionAbandon}
          titre="Abandonner cet ordre de mission ?"
          message="La saisie en cours sera perdue. Aucun ordre de mission n'a encore été enregistré, donc aucun numéro n'aura été consommé."
          libelleConfirmer="Abandonner la saisie"
          libelleAnnuler="Continuer la saisie"
          danger
          onAnnuler={() => setQuestionAbandon(false)}
          onConfirmer={() => {
            setQuestionAbandon(false);
            quitterSansEnregistrer();
          }}
        />
      </div>
    </div>
  );
}

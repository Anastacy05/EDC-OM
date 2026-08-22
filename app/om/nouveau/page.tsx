"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMockOM, genererProchainNumeroOM } from "@/lib/mockData";
import { mockEmployees, findEmployeeByMatricule } from "@/lib/employees";
import { PAYS_SUGGESTIONS, villesDuPays } from "@/lib/locations";
import { zoneDuPaysFr, LIBELLE_ZONE } from "@/lib/zones";
import { montantFraisFixe } from "@/lib/baremes";
import { verifierConcurrence, verifierRetraite } from "@/lib/businessRules";
import { buildDocumentForParticipant } from "@/lib/buildDocument";
import { useBrouillonNonEnregistre } from "@/contexts/brouillonContext";
import {
  inputClass,
  carteClass as fieldsetClass,
  legendClass,
  titrePageClass,
} from "@/lib/styles";
import AutocompleteInput from "@/components/AutocompleteInput";
import OMPreview from "@/components/OMPreview";
import RetourVers from "@/components/RetourVers";
import type { OrdreMission, VisaLeg, Frais } from "@/types/om";

const emptyLeg: VisaLeg = {
  departDe: "",
  departLe: "",
  departHeure: "",
  arriveeA: "",
  arriveeLe: "",
  arriveeHeure: "",
};

// Classes de transport pré-définies par statut existent bien, mais les
// tarifs associés ne sont connus qu'au remboursement final (pas à la
// création de l'OM) — pas pertinent de les anticiper ici. Le champ se
// limite donc au moyen de transport lui-même.
const MOYENS_TRANSPORT = ["Avion", "Train", "Bus", "Voiture de service"];

interface ParticipantDraft {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string;
  poste: string;
  statutHierarchique: string;
  affectation: string;
  situationFamille: string;
  indice: string;
  fraisPrevisionnels: Frais[];
}

interface Probleme {
  bloquant: boolean;
  message: string;
}

const gridClass = "grid grid-cols-1 sm:grid-cols-2 gap-4";

export default function NouvelOMPage() {
  const router = useRouter();
  const { activer: signalerBrouillon, desactiver: effacerBrouillon } = useBrouillonNonEnregistre();

  // Infos partagées par toute la mission
  const [mission, setMission] = useState<Omit<OrdreMission, "id" | "participants">>({});

  // Destination = "Pays, Ville" — le pays choisit d'abord, la liste de
  // villes proposées ensuite ne contient que celles de ce pays.
  const [paysDestination, setPaysDestination] = useState("");
  const [villeDestination, setVilleDestination] = useState("");

  // COMMENTÉ (03/08/2026) — verso non éditable pour l'instant.
  // const [visas, setVisas] = useState<VisaLeg[]>([emptyLeg]);
  //
  // COMMENTÉ (20/08/2026) — les étapes VISA ne sont plus gérées du tout par
  // l'application : elles sont renseignées à la main sur le papier. Le champ
  // `visas` a été retiré de OrdreMission (types/om.ts), donc cette constante
  // n'a plus de destinataire. Les lignes vierges du tableau imprimé sont
  // produites par lignesVisasVierges() dans lib/buildDocument.ts.
  // const visas: VisaLeg[] = [];

  // Infos d'émission — appliquées à tous les participants. nomEmetteur et
  // fonctionEmetteur sont volontairement figés (pas des champs de formulaire) :
  // les normes exigent que tout OM EDC indique le Directeur Général comme
  // émetteur, donc ces valeurs ne dépendent jamais de qui crée l'OM.
  // gradeEmetteur reste vide (pas d'exigence équivalente dessus).
  const [emission, setEmission] = useState({
    nomEmetteur: "EDC",
    gradeEmetteur: "",
    fonctionEmetteur: "Le Directeur Général",
    lieuEmission: "",
    dateEmission: "",
  });
  const setEmissionField = (field: keyof typeof emission, value: string) => {
    setEmission((prev) => ({ ...prev, [field]: value }));
  };

  // Participants ajoutés au fur et à mesure
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [matriculeSaisi, setMatriculeSaisi] = useState("");
  const [nomSaisi, setNomSaisi] = useState("");
  const [erreurAjout, setErreurAjout] = useState("");

  // Signale au BackButton du header qu'il y a un brouillon en cours dès
  // qu'un participant est ajouté — "Annuler" (dans la page) préserve déjà ce
  // travail, mais rien n'empêchait avant de le perdre en quittant par le
  // bouton retour du header, qui ignore l'état de cette page.
  useEffect(() => {
    if (participants.length > 0) signalerBrouillon();
    else effacerBrouillon();
  }, [participants.length, signalerBrouillon, effacerBrouillon]);

  // Toujours désactivé en quittant la page, quelle que soit la raison —
  // sinon un brouillon abandonné ici pourrait déclencher à tort la
  // confirmation sur une tout autre page ensuite.
  useEffect(() => () => effacerBrouillon(), [effacerBrouillon]);

  // Flux valider -> aperçu -> enregistrer
  const [etape, setEtape] = useState<"formulaire" | "apercu">("formulaire");
  const [erreurGenerale, setErreurGenerale] = useState("");
  const [problemesParParticipant, setProblemesParParticipant] = useState<
    Record<string, Probleme[]>
  >({});
  const [numerosGeneres, setNumerosGeneres] = useState<Record<string, string>>({});

  // ✅ NOUVEAU : État pour les erreurs de validation (affichées sous les champs)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setMissionField = (field: keyof typeof mission, value: string) => {
    setMission((prev) => ({ ...prev, [field]: value }));
  };

  // `destination` (la chaîne composée) alimente le document Word ; `pays`/
  // `ville` séparés servent aux filtres de la liste. Les deux sont écrits
  // ensemble pour qu'ils ne puissent jamais diverger.
  const handlePaysChange = (valeur: string) => {
    setPaysDestination(valeur);
    setVilleDestination(""); // le pays change -> la ville choisie n'est plus valide
    setMission((prev) => ({
      ...prev,
      destination: valeur,
      paysDestination: valeur,
      villeDestination: "",
    }));
  };

  const handleVilleChange = (valeur: string) => {
    setVilleDestination(valeur);
    setMission((prev) => ({
      ...prev,
      destination: valeur ? `${paysDestination}, ${valeur}` : paysDestination,
      paysDestination,
      villeDestination: valeur,
    }));
  };
  
  const handleLieuChange = (valeur: string) => {
    setEmissionField("lieuEmission", valeur ?? 'Yaoundé');
  };

  // Recalculé à chaque rendu — juste une recherche dans un Set, pas besoin
  // de useMemo. Redevient `null` tant que `paysDestination` ne correspond
  // pas exactement à un pays reconnu (avant sélection d'une suggestion).
  const zone = zoneDuPaysFr(paysDestination);

  // COMMENTÉ (03/08/2026) — décision : on ne touche pas au verso de l'OM
  // pour l'instant, le tableau VISAS reste vide comme dans le template.
  // const setLegField = (index: number, field: keyof VisaLeg, value: string) => {
  //   setVisas((prev) => prev.map((leg, i) => (i === index ? { ...leg, [field]: value } : leg)));
  // };
  // const ajouterEtape = () => setVisas((prev) => [...prev, { ...emptyLeg }]);
  // const supprimerEtape = (index: number) =>
  //   setVisas((prev) => prev.filter((_, i) => i !== index));

  // Deux champs de recherche pour le même employé — chacun se synchronise
  // sur l'autre dès qu'il y a une correspondance exacte, pour que l'ajout
  // marche qu'on connaisse le matricule ou juste le nom.
  const suggestionsMatricules = mockEmployees.map((e) => e.matricule);
  const suggestionsNoms = mockEmployees.map((e) => `${e.nom} ${e.prenoms}`);

  const handleMatriculeSaisi = (valeur: string) => {
    setMatriculeSaisi(valeur);
    const employe = findEmployeeByMatricule(valeur);
    if (employe) setNomSaisi(`${employe.nom} ${employe.prenoms}`);
  };

  const handleNomSaisi = (valeur: string) => {
    setNomSaisi(valeur);
    const employe = mockEmployees.find((e) => `${e.nom} ${e.prenoms}` === valeur);
    if (employe) setMatriculeSaisi(employe.matricule);
  };

  const ajouterParticipant = () => {
    setErreurAjout("");
    const employe =
      findEmployeeByMatricule(matriculeSaisi) ??
      mockEmployees.find((e) => `${e.nom} ${e.prenoms}` === nomSaisi);
    if (!employe) {
      setErreurAjout("Aucun employé ne correspond à ce matricule ou ce nom.");
      return;
    }
    if (participants.some((p) => p.matricule === employe.matricule)) {
      setErreurAjout("Cet employé est déjà dans la liste.");
      return;
    }
    setParticipants((prev) => [
      ...prev,
      {
        matricule: employe.matricule,
        nom: employe.nom,
        prenoms: employe.prenoms,
        grade: employe.grade,
        poste: employe.poste,
        statutHierarchique: employe.statut,
        affectation: employe.affectation,
        situationFamille: employe.situationFamille,
        indice: employe.indice,
        fraisPrevisionnels: [],
      },
    ]);
    setMatriculeSaisi("");
    setNomSaisi("");
  };

  const retirerParticipant = (matricule: string) =>
    setParticipants((prev) => prev.filter((p) => p.matricule !== matricule));

  // COMMENTÉ (03/08/2026) — décision : les frais ne sont plus gérés par
  // l'appli pour l'instant (même décision que pour le verso/VISAS).
  const ajouterFraisPrevisionnel = (matricule: string) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.matricule === matricule
          ? {
              ...p,
              fraisPrevisionnels: [
                ...p.fraisPrevisionnels,
                { id: crypto.randomUUID(), type: "", montant: 0 },
              ],
            }
          : p
      )
    );
  };
 
  const modifierFraisPrevisionnel = (
    matricule: string,
    fraisId: string,
    champ: "type" | "montant" | "description",
    valeur: string
  ) => {
    setParticipants((prev) =>
      prev.map((p) =>
       p.matricule !== matricule
          ? p
          : {
              ...p,
              fraisPrevisionnels: p.fraisPrevisionnels.map((f) =>
                f.id === fraisId
                  ? { ...f, [champ]: champ === "montant" ? Number(valeur) : valeur }
                  : f
              ),
            }
      )
    );
  };

  // --- Étape "Valider" : règles métier, puis bascule vers l'aperçu ---
  const handleValider = () => {
    setErreurGenerale("");
    setFieldErrors({}); // ✅ On efface les erreurs précédentes

    const newErrors: Record<string, string> = {};
    const newAvertissements: Record<string, Probleme[]> = {};

    // ✅ Validation des champs de mission
    if (!mission.dateDepart) {
      newErrors.dateDepart = "La date de départ est obligatoire.";
    } else {
      const aujourdHui = new Date().toISOString().slice(0, 10);
      if (mission.dateDepart < aujourdHui) {
        newErrors.dateDepart = "La date de départ ne peut pas être dans le passé.";
      }
    }

    if (!mission.dateRetour) {
      newErrors.dateRetour = "La date de retour est obligatoire.";
    } else if (mission.dateDepart && mission.dateRetour < mission.dateDepart) {
      newErrors.dateRetour = "La date de retour ne peut pas être avant la date de départ.";
    }

    if (participants.length === 0) {
      newErrors.participants = "Ajoute au moins un participant.";
    }

    // On sort ici si les dates sont invalides : la boucle ci-dessous passe
    // mission.dateDepart aux règles métier en le supposant défini, ce que
    // les vérifications ci-dessus n'ont pas encore garanti.
    if (newErrors.dateDepart || newErrors.dateRetour || !mission.dateDepart) {
      setFieldErrors(newErrors);
      return;
    }
    const dateDepart = mission.dateDepart;

    // ✅ Validation de chaque participant
    for (const p of participants) {
      const employe = findEmployeeByMatricule(p.matricule);
      const listeProblemes: Probleme[] = [];

      if (employe) {
        const retraite = verifierRetraite(employe, dateDepart);
        if (retraite.bloque) {
          listeProblemes.push({
            bloquant: true,
            message: `${employe.nom} a atteint l'âge de la retraite (${retraite.age} ans) — mission impossible.`,
          });
        }
      }

      const concurrence = verifierConcurrence(p.matricule, dateDepart, mission.dateRetour);
      if (concurrence.niveau === "blocage") {
        listeProblemes.push({
          bloquant: true,
          message: `Conflit avec un OM déjà confirmé (${concurrence.conflits[0]?.destination ?? "autre mission"}).`,
        });
      } else if (concurrence.niveau === "avertissement") {
        listeProblemes.push({
          bloquant: false,
          message: `Chevauchement avec un OM en attente (${concurrence.conflits[0]?.destination ?? "autre mission"}) — à vérifier avant confirmation.`,
        });
      }

      // Séparer les bloquants (erreurs) et les avertissements
      const bloquants = listeProblemes.filter(pb => pb.bloquant);
      const avertissements = listeProblemes.filter(pb => !pb.bloquant);
      if (bloquants.length > 0) {
        newErrors[`participant-${p.matricule}`] = bloquants.map(pb => pb.message).join(" ");
      }
      if (avertissements.length > 0) {
        newAvertissements[p.matricule] = avertissements;
      }
    }

    // ✅ Si des erreurs bloquantes existent, on les affiche et on reste en formulaire
    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      setProblemesParParticipant(newAvertissements);
      // ✅ Scroll vers le premier élément en erreur après le rendu
      setTimeout(() => {
        const firstErrorEl = document.querySelector('[data-error="true"]');
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    // Sinon, on peut passer à l'aperçu
    setProblemesParParticipant(newAvertissements); // on garde les avertissements pour l'aperçu

    // Génère un numéro d'OM par participant, pour l'aperçu ET l'enregistrement final
    const numeros: Record<string, string> = {};
    let compteur = parseInt(genererProchainNumeroOM(), 10);
    for (const p of participants) {
      numeros[p.matricule] = String(compteur).padStart(4, "0");
      compteur++;
    }
    setNumerosGeneres(numeros);
    setEtape("apercu");
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleAnnulerBrouillon = () => {
    setEtape("formulaire");
    setFieldErrors({}); // ✅ Réinitialisation des erreurs
    setProblemesParParticipant({});
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleEnregistrer = () => {
    const nouvelle = addMockOM(
      mission,
      participants.map((p) => ({
        matricule: p.matricule,
        nom: p.nom,
        prenoms: p.prenoms,
        grade: p.grade,
        poste: p.poste,
        statutHierarchique: p.statutHierarchique,
        affectation: p.affectation,
        situationFamille: p.situationFamille,
        indice: p.indice,
        numeroOM: numerosGeneres[p.matricule],
        ...emission,
        // Figé à l'enregistrement — cf. le commentaire sur ce champ dans
        // types/om.ts (ne doit pas bouger si le barème change ensuite).
        montantFraisFixeJournalier: montantFraisFixe(p.statutHierarchique, zone),
        fraisPrevisionnels: p.fraisPrevisionnels,
      }))
    );
    effacerBrouillon(); // enregistré -> plus rien à perdre, le garde-fou n'a plus lieu d'être
    // On enchaîne directement sur le document du premier participant : c'est
    // la page qui porte le bouton de téléchargement, et l'utilisateur vient
    // justement de valider ce document dans l'aperçu. Repli sur la liste si
    // la mission n'a aucun participant (impossible en pratique — la
    // validation en exige au moins un — mais évite une URL cassée).
    const premier = nouvelle.participants[0];
    router.push(premier ? `/om/${nouvelle.id}?participant=${premier.id}` : "/om");
  };

  // ============ ÉTAPE APERÇU ============
  if (etape === "apercu") {
    const missionComplete: OrdreMission = { ...mission, id: "brouillon", participants: [] };
    return (
      <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
        <h1 className={titrePageClass}>
          Aperçu — {participants.length} document{participants.length > 1 ? "s" : ""}
        </h1>

        {Object.keys(problemesParParticipant).length > 0 && (
          <div className="bg-amber-100 border border-amber-300 rounded-xl p-4 text-amber-800 text-sm max-w-4xl mx-auto w-full">
            {Object.entries(problemesParParticipant).map(([matricule, problemes]) => (
              <div key={matricule}>
                {problemes
                  .filter((p) => !p.bloquant)
                  .map((p, i) => (
                    <p key={i}>⚠ {p.message}</p>
                  ))}
              </div>
            ))}
          </div>
        )}

        {participants.map((p) => (
          <OMPreview
            key={p.matricule}
            om={buildDocumentForParticipant(missionComplete, {
              id: p.matricule,
              ...p,
              ...emission,
              numeroOM: numerosGeneres[p.matricule],
              statut: "EN_ATTENTE",
              fraisReels: [],
            })}
          />
        ))}

        <div className="flex justify-center gap-4">
          <button
            onClick={handleAnnulerBrouillon}
            className="py-3 px-8 rounded-full bg-red-600 hover:bg-red-700 text-white
                       shadow-xl shadow-blue-950/20 transition-all duration-300"
          >
            Annuler
          </button>
          <button
            onClick={handleEnregistrer}
            className="py-3 px-8 rounded-full bg-blue-700 hover:bg-blue-800 text-white
                       shadow-xl shadow-blue-950/20 hover:scale-105 transition-all duration-300"
          >
            Enregistrer
          </button>
        </div>
      </div>
    );
  }

  // ============ ÉTAPE FORMULAIRE ============
  return (
    <div className="min-h-full w-full bg-blue-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-8 p-10">
      {/* REMPLACÉ (21/08/2026) — un lien « ... Consulter les ordres » en gros
          bouton bleu plein occupait le rang d'action PRINCIPALE de l'écran,
          alors que la principale est « enregistrer l'ordre de mission » ; les
          points de suspension du libellé étaient de surcroît un reste de
          gabarit. C'est un retour, il prend donc la forme d'un retour — et il
          protège le brouillon en cours, ce que le lien nu ne faisait pas. */}
      <RetourVers
        href="/om"
        libelle="Retour à la liste des ordres de mission"
        protegerBrouillon
      />

      <h1 className={titrePageClass}>Nouvel ordre de mission</h1>

      {erreurGenerale && (
        <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-700 text-sm">
          {erreurGenerale}
        </div>
      )}
      
      {/* Participants */}
      <fieldset
        className={`${fieldsetClass} ${fieldErrors.participants ? "border-red-500" : ""}`}
        data-error={fieldErrors.participants ? "true" : undefined}
      >
        <legend className={legendClass}>Participants</legend>

        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-48">
            <AutocompleteInput
              placeholder="Matricule de l'employé"
              value={matriculeSaisi}
              onChange={handleMatriculeSaisi}
              suggestions={suggestionsMatricules}
            />
          </div>
          <div className="flex-1 min-w-48">
            <AutocompleteInput
              placeholder="Nom de l'employé"
              value={nomSaisi}
              onChange={handleNomSaisi}
              suggestions={suggestionsNoms}
            />
          </div>
          <button
            type="button"
            onClick={ajouterParticipant}
            className="py-2 px-4 rounded-full bg-blue-300 hover:bg-blue-200 shadow-md shadow-blue-950/20 whitespace-nowrap"
          >
            + Ajouter
          </button>
        </div>
        {erreurAjout && <p className="text-red-600 text-sm">{erreurAjout}</p>}
        {fieldErrors.participants && (
          <p className="text-red-600 text-sm mt-2">{fieldErrors.participants}</p>
        )}

        {participants.map((p) => (
          <div
            key={p.matricule}
            className={`rounded-xl border p-4 flex flex-col gap-3 ${
              fieldErrors[`participant-${p.matricule}`] ? "border-red-500" : "border-blue-100"
            }`}
            data-error={fieldErrors[`participant-${p.matricule}`] ? "true" : undefined}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-blue-700">
                  {p.nom} {p.prenoms}
                </p>
                <p className="text-sm text-gray-500">
                  {p.poste} — {p.matricule}
                </p>
                {/* Le montant ne peut être connu qu'une fois le pays de
                    destination choisi (zone) — d'où le message d'attente. */}
                <p className="text-sm text-amber-700">
                  {zone === null
                    ? "Frais fixe journalier : à déterminer une fois la destination choisie"
                    : montantFraisFixe(p.statutHierarchique, zone) !== undefined
                      ? `Frais fixe journalier (indicatif) : ${montantFraisFixe(p.statutHierarchique, zone)!.toLocaleString("fr-FR")} FCFA`
                      : `Aucun frais fixe défini pour le statut "${p.statutHierarchique}".`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => retirerParticipant(p.matricule)}
                className="text-sm text-red-600 hover:underline"
              >
                Retirer
              </button>
            </div>

            {/* ✅ Affichage des erreurs bloquantes pour ce participant */}
            {fieldErrors[`participant-${p.matricule}`] && (
              <p className="text-red-600 text-sm">{fieldErrors[`participant-${p.matricule}`]}</p>
            )}

            {/* ✅ Affichage des avertissements (non bloquants) */}
            {problemesParParticipant[p.matricule]?.map((pb, i) => (
              <p key={i} className="text-amber-700 text-sm">
                ⚠ {pb.message}
              </p>
            ))}
          </div>
        ))}
      </fieldset>

      {/* Mission */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Détails de la mission</legend>
        <div className={gridClass}>
          <AutocompleteInput
            placeholder="Pays de destination"
            value={paysDestination}
            onChange={handlePaysChange}
            suggestions={PAYS_SUGGESTIONS}
          />
          <AutocompleteInput
            placeholder={paysDestination ? "Ville de destination" : "Choisis d'abord un pays pour choisir la ville"}
            value={villeDestination}
            onChange={handleVilleChange}
            suggestions={villesDuPays(paysDestination)}
            disabled={!paysDestination}
          />
          {/* COMMENTÉ (03/08/2026) — "en passant par" dépend trop des
              circonstances du voyage pour être fiable à la saisie ; le
              champ reste vide, comme convenu.
          <AutocompleteInput
            placeholder="En passant par (ville, si escale)"
            value={mission.viaPassage || ""}
            onChange={(v) => setMissionField("viaPassage", v)}
            suggestions={VILLES_SUGGESTIONS}
          />
          */}
        </div>
        {paysDestination && (
          <p className="text-sm text-amber-700">
            {zone !== null
              ? LIBELLE_ZONE[zone]
              : "Pays non reconnu — sélectionne-le dans la liste de suggestions pour déterminer la zone."}
          </p>
        )}
        <textarea
          placeholder="Motif et références"
          onChange={(e) => setMissionField("motif", e.target.value)}
          className={`${inputClass} min-h-24`}
        />
        <div className={gridClass}>
          <input
            placeholder="Financement"
            onChange={(e) => setMissionField("financement", e.target.value)}
            className={inputClass}
          />
          <AutocompleteInput
            placeholder="Moyen de transport"
            value={mission.moyenTransport || ""}
            onChange={(v) => setMissionField("moyenTransport", v)}
            suggestions={MOYENS_TRANSPORT}
          />
          {/* ✅ Date de départ avec gestion d'erreur */}
          <div
            className="flex flex-col gap-1 text-sm text-amber-700"
            data-error={fieldErrors.dateDepart ? "true" : undefined}
          >
            <label>Date de départ</label>
            <input
              type="date"
              onChange={(e) => setMissionField("dateDepart", e.target.value)}
              className={`${inputClass} ${fieldErrors.dateDepart ? "border-red-500" : ""}`}
            />
            {fieldErrors.dateDepart && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.dateDepart}</p>
            )}
          </div>
          {/* ✅ Date de retour avec gestion d'erreur */}
          <div
            className="flex flex-col gap-1 text-sm text-amber-700"
            data-error={fieldErrors.dateRetour ? "true" : undefined}
          >
            <label>Date de retour</label>
            <input
              type="date"
              onChange={(e) => setMissionField("dateRetour", e.target.value)}
              className={`${inputClass} ${fieldErrors.dateRetour ? "border-red-500" : ""}`}
            />
            {fieldErrors.dateRetour && (
              <p className="text-red-600 text-xs mt-1">{fieldErrors.dateRetour}</p>
            )}
          </div>
        </div>
      </fieldset>

      {/* COMMENTÉ (03/08/2026) — décision : on ne touche pas au verso de
          l'OM pour l'instant, le tableau VISAS reste vide comme le template.

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Étapes du trajet</legend>
        {visas.map((leg, i) => (
          <div key={i} className="rounded-xl border border-blue-100 p-4 flex flex-col gap-3">
            <p className="text-sm font-medium text-blue-700">Étape {i + 1}</p>
            <div className={gridClass}>
              <AutocompleteInput
                placeholder="Départ de (pays)"
                value={leg.departDe}
                onChange={(v) => setLegField(i, "departDe", v)}
                suggestions={PAYS_SUGGESTIONS}
              />
              <AutocompleteInput
                placeholder="Arrivée à (pays)"
                value={leg.arriveeA}
                onChange={(v) => setLegField(i, "arriveeA", v)}
                suggestions={PAYS_SUGGESTIONS}
              />
              <label className="flex flex-col gap-1 text-sm text-amber-700">
                Départ le
                <input
                  type="date"
                  value={leg.departLe}
                  onChange={(e) => setLegField(i, "departLe", e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-amber-700">
                Arrivée le
                <input
                  type="date"
                  value={leg.arriveeLe}
                  onChange={(e) => setLegField(i, "arriveeLe", e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-amber-700">
                Départ à (heure)
                <input
                  type="time"
                  value={leg.departHeure}
                  onChange={(e) => setLegField(i, "departHeure", e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-amber-700">
                Arrivée à (heure)
                <input
                  type="time"
                  value={leg.arriveeHeure}
                  onChange={(e) => setLegField(i, "arriveeHeure", e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            {visas.length > 1 && (
              <button
                type="button"
                onClick={() => supprimerEtape(i)}
                className="self-start text-sm text-red-600 hover:underline"
              >
                Supprimer cette étape
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={ajouterEtape}
          className="self-start py-2 px-4 rounded-full bg-blue-300 hover:bg-blue-200
                     shadow-md shadow-blue-950/20 transition-all duration-300"
        >
          + Ajouter une étape
        </button>
      </fieldset>

      */}

      {/* Émission — appliquée à tous les participants */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Émission</legend>
        <div className={gridClass}>
          <AutocompleteInput
            placeholder="Lieu d'émission"
            value={emission.lieuEmission}
            onChange={handleLieuChange}
            suggestions={villesDuPays("Cameroun")}
          />
          <label className="flex flex-col gap-1 text-sm text-amber-700">
            Date d&apos;émission
            <input
              type="date"
              value={emission.dateEmission}
              onChange={(e) => setEmissionField("dateEmission", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={handleAnnulerBrouillon}
          className="py-3 px-8 rounded-full bg-red-600 hover:bg-red-700 text-white
                     shadow-xl shadow-blue-950/20 transition-all duration-300"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleValider}
          className="py-3 px-8 rounded-full bg-blue-700 hover:bg-blue-800 text-white
                     shadow-xl shadow-blue-950/20 hover:scale-105 transition-all duration-300"
        >
          Valider
        </button>
      </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMockOM, genererProchainNumeroOM } from "@/lib/mockData";
import { mockEmployees, findEmployeeByMatricule } from "@/lib/employees";
import { VILLES_SUGGESTIONS /*, PAYS_SUGGESTIONS */ } from "@/lib/locations";
import { verifierConcurrence, verifierRetraite, verifierQuotaAnnuel } from "@/lib/businessRules";
import { buildDocumentForParticipant } from "@/lib/buildDocument";
import AutocompleteInput from "@/components/AutocompleteInput";
import OMPreview from "@/components/OMPreview";
import type { OrdreMission, VisaLeg, Frais } from "@/types/om";

const emptyLeg: VisaLeg = {
  departDe: "",
  departLe: "",
  departHeure: "",
  arriveeA: "",
  arriveeLe: "",
  arriveeHeure: "",
};

interface ParticipantDraft {
  matricule: string;
  nom: string;
  prenoms: string;
  grade: string;
  poste: string;
  affectation: string;
  situationFamille: string;
  indice: string;
  fraisPrevisionnels: Frais[];
}

interface Probleme {
  bloquant: boolean;
  message: string;
}

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400";
const fieldsetClass = "bg-white/70 rounded-2xl shadow-md shadow-blue-950/10 p-6 flex flex-col gap-4";
const legendClass = "text-amber-600 font-semibold px-2 text-lg";
const gridClass = "grid grid-cols-1 sm:grid-cols-2 gap-4";

export default function NouvelOMPage() {
  const router = useRouter();

  // Infos partagées par toute la mission
  const [mission, setMission] = useState<Omit<OrdreMission, "id" | "participants">>({});
  // COMMENTÉ (03/08/2026) — verso non éditable pour l'instant.
  // const [visas, setVisas] = useState<VisaLeg[]>([emptyLeg]);
  const visas: VisaLeg[] = []; // toujours vide -> le tableau VISAS reste blanc comme le template

  // Infos d'émission — appliquées à tous les participants au moment de
  // l'enregistrement (même officier RH pour tout le lot dans l'immense
  // majorité des cas). Champ par champ dans types/om.ts, pas dans OrdreMission.
  const [emission, setEmission] = useState({
    nomEmetteur: "",
    gradeEmetteur: "",
    fonctionEmetteur: "",
    lieuEmission: "Yaoundé",
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

  // Flux valider -> aperçu -> enregistrer
  const [etape, setEtape] = useState<"formulaire" | "apercu">("formulaire");
  const [erreurGenerale, setErreurGenerale] = useState("");
  const [problemesParParticipant, setProblemesParParticipant] = useState<
    Record<string, Probleme[]>
  >({});
  const [numerosGeneres, setNumerosGeneres] = useState<Record<string, string>>({});

  const setMissionField = (field: keyof typeof mission, value: string) => {
    setMission((prev) => ({ ...prev, [field]: value }));
  };

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
  // const ajouterFraisPrevisionnel = (matricule: string) => {
  //   setParticipants((prev) =>
  //     prev.map((p) =>
  //       p.matricule === matricule
  //         ? {
  //             ...p,
  //             fraisPrevisionnels: [
  //               ...p.fraisPrevisionnels,
  //               { id: crypto.randomUUID(), type: "", montant: 0 },
  //             ],
  //           }
  //         : p
  //     )
  //   );
  // };
  //
  // const modifierFraisPrevisionnel = (
  //   matricule: string,
  //   fraisId: string,
  //   champ: "type" | "montant" | "description",
  //   valeur: string
  // ) => {
  //   setParticipants((prev) =>
  //     prev.map((p) =>
  //       p.matricule !== matricule
  //         ? p
  //         : {
  //             ...p,
  //             fraisPrevisionnels: p.fraisPrevisionnels.map((f) =>
  //               f.id === fraisId
  //                 ? { ...f, [champ]: champ === "montant" ? Number(valeur) : valeur }
  //                 : f
  //             ),
  //           }
  //     )
  //   );
  // };

  // --- Étape "Valider" : règles métier, puis bascule vers l'aperçu ---
  const handleValider = () => {
    setErreurGenerale("");

    if (!mission.dateDepart) {
      setErreurGenerale("La date de départ est obligatoire.");
      return;
    }
    const aujourdHui = new Date().toISOString().slice(0, 10);
    if (mission.dateDepart < aujourdHui) {
      setErreurGenerale("La période de mission est déjà écoulée.");
      return;
    }
    if (participants.length === 0) {
      setErreurGenerale("Ajoute au moins un participant.");
      return;
    }

    const problemes: Record<string, Probleme[]> = {};
    let bloque = false;

    for (const p of participants) {
      const employe = findEmployeeByMatricule(p.matricule);
      const listeProblemes: Probleme[] = [];

      if (employe) {
        const retraite = verifierRetraite(employe, mission.dateDepart);
        if (retraite.bloque) {
          listeProblemes.push({
            bloquant: true,
            message: `${employe.nom} a atteint l'âge de la retraite (${retraite.age} ans) — mission impossible.`,
          });
        }

        const quota = verifierQuotaAnnuel(employe, mission.dateDepart);
        if (!quota.autorise) {
          listeProblemes.push({
            bloquant: true,
            message: `Quota annuel atteint pour le poste "${employe.poste}" (${quota.utilises}/${quota.quota} missions).`,
          });
        }
      }

      const concurrence = verifierConcurrence(p.matricule, mission.dateDepart, mission.dateRetour);
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

      if (listeProblemes.length > 0) problemes[p.matricule] = listeProblemes;
      if (listeProblemes.some((pr) => pr.bloquant)) bloque = true;
    }

    setProblemesParParticipant(problemes);

    if (bloque) return; // on reste sur le formulaire, rien à enregistrer

    // Génère un numéro d'OM par participant, pour l'aperçu ET l'enregistrement final
    const numeros: Record<string, string> = {};
    let compteur = parseInt(genererProchainNumeroOM(), 10);
    for (const p of participants) {
      numeros[p.matricule] = String(compteur).padStart(4, "0");
      compteur++;
    }
    setNumerosGeneres(numeros);
    setEtape("apercu");
  };

  const handleAnnulerBrouillon = () => {
    if (!confirm("Annuler la création de cet ordre de mission ?")) return;
    router.push("/om");
  };

  const handleEnregistrer = () => {
    addMockOM(
      { ...mission, visas },
      participants.map((p) => ({
        matricule: p.matricule,
        nom: p.nom,
        prenoms: p.prenoms,
        grade: p.grade,
        poste: p.poste,
        affectation: p.affectation,
        situationFamille: p.situationFamille,
        indice: p.indice,
        numeroOM: numerosGeneres[p.matricule],
        ...emission,
        fraisPrevisionnels: p.fraisPrevisionnels,
      }))
    );
    router.push("/om");
  };

  // ============ ÉTAPE APERÇU ============
  if (etape === "apercu") {
    const missionComplete: OrdreMission = { ...mission, id: "brouillon", visas, participants: [] };
    return (
      <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
        <h1 className="text-3xl font-bold italic text-amber-500 drop-shadow-xl">
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
      <h1 className="text-3xl font-bold italic text-amber-500 drop-shadow-xl">
        Nouvel ordre de mission
      </h1>

      {erreurGenerale && (
        <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-700 text-sm">
          {erreurGenerale}
        </div>
      )}

      {/* Mission */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Détails de la mission</legend>
        <div className={gridClass}>
          <AutocompleteInput
            placeholder="Destination (ville)"
            value={mission.destination || ""}
            onChange={(v) => setMissionField("destination", v)}
            suggestions={VILLES_SUGGESTIONS}
          />
          <AutocompleteInput
            placeholder="En passant par (ville, si escale)"
            value={mission.viaPassage || ""}
            onChange={(v) => setMissionField("viaPassage", v)}
            suggestions={VILLES_SUGGESTIONS}
          />
        </div>
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
          <input
            placeholder="Moyen de transport"
            onChange={(e) => setMissionField("moyenTransport", e.target.value)}
            className={inputClass}
          />
          <label className="flex flex-col gap-1 text-sm text-amber-700">
            Date de départ
            <input
              type="date"
              onChange={(e) => setMissionField("dateDepart", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-amber-700">
            Date de retour
            <input
              type="date"
              onChange={(e) => setMissionField("dateRetour", e.target.value)}
              className={inputClass}
            />
          </label>
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
          <input
            placeholder="Nom de l'émetteur"
            value={emission.nomEmetteur}
            onChange={(e) => setEmissionField("nomEmetteur", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Grade de l'émetteur"
            value={emission.gradeEmetteur}
            onChange={(e) => setEmissionField("gradeEmetteur", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Fonction"
            value={emission.fonctionEmetteur}
            onChange={(e) => setEmissionField("fonctionEmetteur", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Lieu d'émission"
            value={emission.lieuEmission}
            onChange={(e) => setEmissionField("lieuEmission", e.target.value)}
            className={inputClass}
          />
          <label className="flex flex-col gap-1 text-sm text-amber-700">
            Date d'émission
            <input
              type="date"
              value={emission.dateEmission}
              onChange={(e) => setEmissionField("dateEmission", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {/* Participants */}
      <fieldset className={fieldsetClass}>
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

        {participants.map((p) => (
          <div key={p.matricule} className="rounded-xl border border-blue-100 p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-blue-700">
                  {p.nom} {p.prenoms}
                </p>
                <p className="text-sm text-gray-500">
                  {p.poste} — {p.matricule}
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

            {problemesParParticipant[p.matricule]?.map((pb, i) => (
              <p key={i} className={`text-sm ${pb.bloquant ? "text-red-600" : "text-amber-700"}`}>
                {pb.bloquant ? "✕" : "⚠"} {pb.message}
              </p>
            ))}

            {/* COMMENTÉ (03/08/2026) — frais non gérés par l'appli pour l'instant.
            <div className="flex flex-col gap-2">
              <p className="text-sm text-amber-700">Frais prévisionnels</p>
              {p.fraisPrevisionnels.map((f) => (
                <div key={f.id} className="flex gap-2">
                  <input
                    placeholder="Type (transport, hébergement...)"
                    value={f.type}
                    onChange={(e) =>
                      modifierFraisPrevisionnel(p.matricule, f.id, "type", e.target.value)
                    }
                    className={inputClass}
                  />
                  <input
                    type="number"
                    placeholder="Montant"
                    value={f.montant || ""}
                    onChange={(e) =>
                      modifierFraisPrevisionnel(p.matricule, f.id, "montant", e.target.value)
                    }
                    className={`${inputClass} w-32`}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => ajouterFraisPrevisionnel(p.matricule)}
                className="self-start text-sm text-blue-700 hover:underline"
              >
                + Ajouter un frais
              </button>
            </div>
            */}
          </div>
        ))}
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

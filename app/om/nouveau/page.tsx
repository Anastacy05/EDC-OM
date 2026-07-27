"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMockOM } from "@/lib/mockData";
import { mockEmployees, findEmployeeByMatricule } from "@/lib/employees";
import { VILLES_SUGGESTIONS, PAYS_SUGGESTIONS } from "@/lib/locations";
import AutocompleteInput from "@/components/AutocompleteInput";
import type { OrdreMission, VisaLeg } from "@/types/om";

const emptyLeg: VisaLeg = {
  departDe: "",
  departLe: "",
  departHeure: "",
  arriveeA: "",
  arriveeLe: "",
  arriveeHeure: "",
};

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const fieldsetClass = "bg-white/70 rounded-2xl shadow-md shadow-blue-950/10 p-6 flex flex-col gap-4";
const legendClass = "text-amber-600 font-semibold px-2 text-lg";
const gridClass = "grid grid-cols-1 sm:grid-cols-2 gap-4";

export default function NouvelOMPage() {
  const router = useRouter();
  const [form, setForm] = useState<OrdreMission>({});
  const [visas, setVisas] = useState<VisaLeg[]>([emptyLeg]);

  const setField = (field: keyof OrdreMission, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Dès que le matricule saisi correspond exactement à un employé connu,
  // on remplit automatiquement tout ce qu'on sait déjà de lui.
  const handleMatriculeChange = (matricule: string) => {
    setField("matricule", matricule);
    const employe = findEmployeeByMatricule(matricule);
    if (employe) {
      setForm((prev) => ({
        ...prev,
        matricule: employe.matricule,
        nom: employe.nom,
        prenoms: employe.prenoms,
        grade: employe.grade,
        affectation: employe.affectation,
        situationFamille: employe.situationFamille,
        indice: employe.indice,
      }));
    }
  };

  const setLegField = (index: number, field: keyof VisaLeg, value: string) => {
    setVisas((prev) =>
      prev.map((leg, i) => (i === index ? { ...leg, [field]: value } : leg))
    );
  };

  const ajouterEtape = () => setVisas((prev) => [...prev, { ...emptyLeg }]);
  const supprimerEtape = (index: number) =>
    setVisas((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nouvelOM = addMockOM({ ...form, visas });
    router.push(`/om/${nouvelOM.id}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10 max-w-4xl mx-auto"
    >
      <h1 className="text-3xl font-bold italic text-amber-500 drop-shadow-xl">
        Nouvel ordre de mission
      </h1>

      {/* Identité — tape le matricule, le reste se remplit tout seul si l'employé existe */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Identité de l'agent</legend>

        <div>
          <input
            list="liste-matricules"
            placeholder="Matricule"
            value={form.matricule || ""}
            onChange={(e) => handleMatriculeChange(e.target.value)}
            className={inputClass}
          />
          <datalist id="liste-matricules">
            {mockEmployees.map((e) => (
              <option key={e.matricule} value={e.matricule}>
                {e.nom} {e.prenoms}
              </option>
            ))}
          </datalist>
        </div>

        <div className={gridClass}>
          <input
            placeholder="Nom"
            value={form.nom || ""}
            onChange={(e) => setField("nom", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Prénoms"
            value={form.prenoms || ""}
            onChange={(e) => setField("prenoms", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Grade"
            value={form.grade || ""}
            onChange={(e) => setField("grade", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Département / Affectation"
            value={form.affectation || ""}
            onChange={(e) => setField("affectation", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Situation de famille"
            value={form.situationFamille || ""}
            onChange={(e) => setField("situationFamille", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Indice"
            value={form.indice || ""}
            onChange={(e) => setField("indice", e.target.value)}
            className={inputClass}
          />
        </div>
      </fieldset>

      {/* Mission */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Détails de la mission</legend>

        <div className={gridClass}>
          <AutocompleteInput
            placeholder="Destination (ville)"
            value={form.destination || ""}
            onChange={(v) => setField("destination", v)}
            suggestions={VILLES_SUGGESTIONS}
          />
          <AutocompleteInput
            placeholder="En passant par (ville, si escale)"
            value={form.viaPassage || ""}
            onChange={(v) => setField("viaPassage", v)}
            suggestions={VILLES_SUGGESTIONS}
          />
        </div>

        <textarea
          placeholder="Motif et références"
          onChange={(e) => setField("motif", e.target.value)}
          className={`${inputClass} min-h-24`}
        />

        <div className={gridClass}>
          <input
            placeholder="Financement"
            onChange={(e) => setField("financement", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Moyen de transport"
            onChange={(e) => setField("moyenTransport", e.target.value)}
            className={inputClass}
          />
          <label className="flex flex-col gap-1 text-sm text-amber-700">
            Date de départ
            <input
              type="date"
              onChange={(e) => setField("dateDepart", e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-amber-700">
            Date de retour
            <input
              type="date"
              onChange={(e) => setField("dateRetour", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {/* Étapes de mission (tableau VISAS, page 2) */}
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
              <input
                placeholder="Départ le"
                value={leg.departLe}
                onChange={(e) => setLegField(i, "departLe", e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Arrivée le"
                value={leg.arriveeLe}
                onChange={(e) => setLegField(i, "arriveeLe", e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Départ à (heure)"
                value={leg.departHeure}
                onChange={(e) => setLegField(i, "departHeure", e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Arrivée à (heure)"
                value={leg.arriveeHeure}
                onChange={(e) => setLegField(i, "arriveeHeure", e.target.value)}
                className={inputClass}
              />
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

      {/* Émission */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Émission</legend>

        <div className={gridClass}>
          <input
            placeholder="Nom de l'émetteur"
            onChange={(e) => setField("nomEmetteur", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Grade de l'émetteur"
            onChange={(e) => setField("gradeEmetteur", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Fonction"
            onChange={(e) => setField("fonctionEmetteur", e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Lieu d'émission"
            defaultValue="Yaoundé"
            onChange={(e) => setField("lieuEmission", e.target.value)}
            className={inputClass}
          />
          <label className="flex flex-col gap-1 text-sm text-amber-700">
            Date d'émission
            <input
              type="date"
              onChange={(e) => setField("dateEmission", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <button
        type="submit"
        className="self-center py-3 px-8 rounded-full bg-blue-700 hover:bg-blue-800 text-white
                   shadow-xl shadow-blue-950/20 hover:scale-105 transition-all duration-300"
      >
        Créer l'ordre de mission
      </button>
    </form>
  );
}

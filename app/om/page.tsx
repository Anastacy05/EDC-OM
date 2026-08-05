"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { mockOMs } from "@/lib/mockData";
import { dureeEnJours } from "@/lib/dateUtils";
import { DEPARTEMENTS, POSTES, libelleDepartement } from "@/lib/referentiels";
import { PAYS_SUGGESTIONS, villesDuPays, paysEtVilleDeOM } from "@/lib/locations";
import { filtreInputClass as inputClass, titrePageClass } from "@/lib/styles";
import AutocompleteInput from "@/components/AutocompleteInput";

const statutStyles: Record<string, string> = {
  EN_ATTENTE: "bg-amber-200 text-amber-800",
  CONFIRME: "bg-green-200 text-green-800",
  ANNULE: "bg-red-200 text-red-800",
};

export default function OMListPage() {
  const [filtreNom, setFiltreNom] = useState("");
  const [filtrePays, setFiltrePays] = useState("");
  const [filtreVille, setFiltreVille] = useState("");
  const [filtrePoste, setFiltrePoste] = useState("");
  const [filtreDepartement, setFiltreDepartement] = useState("");
  const [periodeDebut, setPeriodeDebut] = useState("");
  const [periodeFin, setPeriodeFin] = useState("");
  const [dureeMin, setDureeMin] = useState("");
  const [dureeMax, setDureeMax] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("TOUS");

  // Un OM peut concerner plusieurs employés — la liste affiche une ligne
  // par participant, chacune renvoyant vers son document dans le détail.
  const lignes = mockOMs.flatMap((om) => om.participants.map((participant) => ({ om, participant })));

  // Noms réellement présents dans les données, pour l'autocomplétion. Le
  // useMemo est nécessaire : AutocompleteInput met en cache les formes
  // normalisées dans une WeakMap indexée par la référence du tableau, qu'un
  // tableau recréé à chaque rendu invaliderait.
  const nomsSuggeres = useMemo(
    () =>
      [...new Set(lignes.map(({ participant }) => participant.nom).filter(Boolean))].sort((a, b) =>
        a!.localeCompare(b!, "fr")
      ) as string[],
    [lignes]
  );

  const villesDuPaysFiltre = useMemo(() => villesDuPays(filtrePays), [filtrePays]);

  const changerPays = (valeur: string) => {
    setFiltrePays(valeur);
    setFiltreVille(""); // le pays change -> la ville sélectionnée n'a plus de sens
  };

  const lignesFiltrees = lignes.filter(({ om, participant }) => {
    const matchNom = participant.nom?.toLowerCase().includes(filtreNom.toLowerCase());

    // Poste et département viennent de référentiels fermés (listes
    // déroulantes) : on compare à l'identique, pas en "contient" — sinon
    // "Directeur" remonterait aussi "Directeur Général" et "Directeur
    // Général Adjoint".
    const matchPoste = filtrePoste === "" || participant.poste === filtrePoste;
    const matchDepartement = filtreDepartement === "" || participant.affectation === filtreDepartement;

    // La saisie pays/ville reste libre (autocomplétion), donc "contient".
    const { pays, ville } = paysEtVilleDeOM(om);
    const matchPays = pays.toLowerCase().includes(filtrePays.toLowerCase());
    const matchVille = ville.toLowerCase().includes(filtreVille.toLowerCase());

    const matchStatut = filtreStatut === "TOUS" || participant.statut === filtreStatut;

    const matchPeriodeDebut = periodeDebut === "" || (om.dateDepart ?? "") >= periodeDebut;
    const matchPeriodeFin = periodeFin === "" || (om.dateDepart ?? "") <= periodeFin;

    const duree = dureeEnJours(om.dateDepart, om.dateRetour);
    const matchDureeMin = dureeMin === "" || (duree !== null && duree >= Number(dureeMin));
    const matchDureeMax = dureeMax === "" || (duree !== null && duree <= Number(dureeMax));

    return (
      matchNom &&
      matchPays &&
      matchVille &&
      matchPoste &&
      matchDepartement &&
      matchStatut &&
      matchPeriodeDebut &&
      matchPeriodeFin &&
      matchDureeMin &&
      matchDureeMax
    );
  });

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className={titrePageClass}>
          Ordres de mission
        </h1>
        <Link
          href="/om/nouveau"
          className="py-2 px-5 rounded-full bg-blue-700 hover:bg-blue-800 text-white
                     shadow-md shadow-blue-950/20 hover:scale-105 transition-all duration-300"
        >
          + Nouvel ordre de mission
        </Link>
      </div>

      {/* Filtres */}
      <div className="bg-white/70 rounded-2xl shadow-md shadow-blue-950/10 p-6 flex flex-wrap gap-3 items-end">
        <div className="w-52">
          <AutocompleteInput
            value={filtreNom}
            onChange={setFiltreNom}
            suggestions={nomsSuggeres}
            placeholder="Nom"
          />
        </div>

        <select
          value={filtrePoste}
          onChange={(e) => setFiltrePoste(e.target.value)}
          className={inputClass}
        >
          <option value="">Tous les postes</option>
          {POSTES.map((p) => (
            <option key={p.valeur} value={p.valeur}>
              {p.libelle}
            </option>
          ))}
        </select>

        <select
          value={filtreDepartement}
          onChange={(e) => setFiltreDepartement(e.target.value)}
          className={inputClass}
        >
          <option value="">Tous les départements</option>
          {DEPARTEMENTS.map((d) => (
            <option key={d.valeur} value={d.valeur}>
              {d.libelle}
            </option>
          ))}
        </select>

        {/* Même cascade que le formulaire de création : la ville ne se
            choisit qu'une fois le pays connu. */}
        <div className="w-52">
          <AutocompleteInput
            value={filtrePays}
            onChange={changerPays}
            suggestions={PAYS_SUGGESTIONS}
            placeholder="Pays"
          />
        </div>
        <div className="w-52">
          <AutocompleteInput
            value={filtreVille}
            onChange={setFiltreVille}
            suggestions={villesDuPaysFiltre}
            disabled={!filtrePays}
            placeholder={filtrePays ? "Ville" : "Choisis d'abord un pays"}
          />
        </div>

        <label className="flex flex-col gap-1 text-xs text-amber-700">
          Période — du
          <input
            type="date"
            value={periodeDebut}
            onChange={(e) => setPeriodeDebut(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-amber-700">
          au
          <input
            type="date"
            value={periodeFin}
            onChange={(e) => setPeriodeFin(e.target.value)}
            className={inputClass}
          />
        </label>

        <input
          type="number"
          placeholder="Durée min (j.)"
          value={dureeMin}
          onChange={(e) => setDureeMin(e.target.value)}
          className={`${inputClass} w-36`}
        />
        <input
          type="number"
          placeholder="Durée max (j.)"
          value={dureeMax}
          onChange={(e) => setDureeMax(e.target.value)}
          className={`${inputClass} w-36`}
        />

        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className={inputClass}
        >
          <option value="TOUS">Tous les statuts</option>
          <option value="EN_ATTENTE">En attente</option>
          <option value="CONFIRME">Confirmé</option>
          <option value="ANNULE">Annulé</option>
        </select>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl shadow-md shadow-blue-950/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-500 text-white">
              <th className="text-left py-3 px-4">Nom</th>
              <th className="text-left py-3 px-4">Poste</th>
              <th className="text-left py-3 px-4">Département</th>
              <th className="text-left py-3 px-4">Destination</th>
              <th className="text-left py-3 px-4">Départ</th>
              <th className="text-left py-3 px-4">Retour</th>
              <th className="text-left py-3 px-4">Durée</th>
              <th className="text-left py-3 px-4">Statut</th>
            </tr>
          </thead>
          <tbody>
            {lignesFiltrees.map(({ om, participant }, i) => (
              <tr
                key={participant.id}
                className={`${i % 2 === 0 ? "bg-white" : "bg-blue-50"} hover:bg-blue-100 transition-colors`}
              >
                <td className="py-3 px-4">
                  <Link
                    href={`/om/${om.id}?participant=${participant.id}`}
                    className="text-blue-700 font-medium hover:underline"
                  >
                    {participant.nom}
                  </Link>
                </td>
                <td className="py-3 px-4">{participant.poste}</td>
                <td
                  className="py-3 px-4"
                  title={libelleDepartement(participant.affectation)}
                >
                  {participant.affectation}
                </td>
                <td className="py-3 px-4">{om.destination}</td>
                <td className="py-3 px-4">{om.dateDepart}</td>
                <td className="py-3 px-4">{om.dateRetour}</td>
                <td className="py-3 px-4">{dureeEnJours(om.dateDepart, om.dateRetour)} j.</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${statutStyles[participant.statut] ?? ""}`}
                  >
                    {participant.statut}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {lignesFiltrees.length === 0 && (
          <p className="text-center text-amber-700 py-8">
            Aucun ordre de mission ne correspond aux filtres.
          </p>
        )}
      </div>
    </div>
  );
}

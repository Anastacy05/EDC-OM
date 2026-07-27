"use client";

import { useState } from "react";
import Link from "next/link";
import { mockOMs } from "@/lib/mockData";
import { dureeEnJours, moisDeLaMission, NOMS_MOIS } from "@/lib/dateUtils";

const statutStyles: Record<string, string> = {
  EN_ATTENTE: "bg-amber-200 text-amber-800",
  CONFIRME: "bg-green-200 text-green-800",
  ANNULE: "bg-red-200 text-red-800",
};

const inputClass =
  "px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

export default function OMListPage() {
  const [filtreNom, setFiltreNom] = useState("");
  const [filtreLieu, setFiltreLieu] = useState("");
  const [filtreGrade, setFiltreGrade] = useState("");
  const [filtreDepartement, setFiltreDepartement] = useState("");
  const [filtreMois, setFiltreMois] = useState("TOUS");
  const [dureeMin, setDureeMin] = useState("");
  const [dureeMax, setDureeMax] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("TOUS");

  const omsFiltres = mockOMs.filter((om) => {
    const matchNom = om.nom?.toLowerCase().includes(filtreNom.toLowerCase());
    const matchLieu = om.destination?.toLowerCase().includes(filtreLieu.toLowerCase());
    const matchGrade = om.grade?.toLowerCase().includes(filtreGrade.toLowerCase());
    const matchDepartement = om.affectation
      ?.toLowerCase()
      .includes(filtreDepartement.toLowerCase());
    const matchStatut = filtreStatut === "TOUS" || om.statut === filtreStatut;

    const mois = moisDeLaMission(om.dateDepart);
    const matchMois = filtreMois === "TOUS" || mois === Number(filtreMois);

    const duree = dureeEnJours(om.dateDepart, om.dateRetour);
    const matchDureeMin = dureeMin === "" || (duree !== null && duree >= Number(dureeMin));
    const matchDureeMax = dureeMax === "" || (duree !== null && duree <= Number(dureeMax));

    return (
      matchNom &&
      matchLieu &&
      matchGrade &&
      matchDepartement &&
      matchStatut &&
      matchMois &&
      matchDureeMin &&
      matchDureeMax
    );
  });

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold italic text-amber-500 drop-shadow-xl">
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
      <div className="bg-white/70 rounded-2xl shadow-md shadow-blue-950/10 p-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Nom"
          value={filtreNom}
          onChange={(e) => setFiltreNom(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Lieu"
          value={filtreLieu}
          onChange={(e) => setFiltreLieu(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Grade"
          value={filtreGrade}
          onChange={(e) => setFiltreGrade(e.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Département"
          value={filtreDepartement}
          onChange={(e) => setFiltreDepartement(e.target.value)}
          className={inputClass}
        />

        <select
          value={filtreMois}
          onChange={(e) => setFiltreMois(e.target.value)}
          className={inputClass}
        >
          <option value="TOUS">Tous les mois</option>
          {NOMS_MOIS.map((nom, index) => (
            <option key={nom} value={index}>
              {nom}
            </option>
          ))}
        </select>

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
              <th className="text-left py-3 px-4">Grade</th>
              <th className="text-left py-3 px-4">Département</th>
              <th className="text-left py-3 px-4">Destination</th>
              <th className="text-left py-3 px-4">Départ</th>
              <th className="text-left py-3 px-4">Retour</th>
              <th className="text-left py-3 px-4">Durée</th>
              <th className="text-left py-3 px-4">Statut</th>
            </tr>
          </thead>
          <tbody>
            {omsFiltres.map((om, i) => (
              <tr
                key={om.id}
                className={`${i % 2 === 0 ? "bg-white" : "bg-blue-50"} hover:bg-blue-100 transition-colors`}
              >
                <td className="py-3 px-4">
                  <Link href={`/om/${om.id}`} className="text-blue-700 font-medium hover:underline">
                    {om.nom}
                  </Link>
                </td>
                <td className="py-3 px-4">{om.grade}</td>
                <td className="py-3 px-4">{om.affectation}</td>
                <td className="py-3 px-4">{om.destination}</td>
                <td className="py-3 px-4">{om.dateDepart}</td>
                <td className="py-3 px-4">{om.dateRetour}</td>
                <td className="py-3 px-4">{dureeEnJours(om.dateDepart, om.dateRetour)} j.</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${statutStyles[om.statut] ?? ""}`}
                  >
                    {om.statut}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {omsFiltres.length === 0 && (
          <p className="text-center text-amber-700 py-8">
            Aucun ordre de mission ne correspond aux filtres.
          </p>
        )}
      </div>
    </div>
  );
}

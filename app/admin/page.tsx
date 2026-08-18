"use client";

import { useState } from "react";
import Link from "next/link";
import { configOM, mettreAJourConfig, reinitialiserConfig } from "@/lib/config";
import { useEstMonte } from "@/lib/useEstMonte";
import { inputClass, carteClass, legendClass, titrePageClass } from "@/lib/styles";

const RAPPORTS = [
  {
    href: "/admin/carte",
    titre: "Carte du monde",
    description: "Nombre de missions par continent, avec zoom par pays.",
  },
  {
    href: "/admin/frise",
    titre: "Frise chronologique",
    description: "Nombre de missions par année, avec détail par mois.",
  },
  {
    href: "/admin/pyramide",
    titre: "Pyramide hiérarchique",
    description: "Nombre de missions par statut, avec détail par employé.",
  },
];

export default function AdminPage() {
  const estMonte = useEstMonte();

  // Initialiseur paresseux : lu une seule fois, après hydratation (le rendu
  // serveur ne franchit jamais le garde-fou `estMonte` ci-dessous, donc cette
  // valeur par défaut du serveur n'est jamais affichée).
  const [ageRetraite, setAgeRetraite] = useState(() => String(configOM.ageRetraite));
  const [confirmation, setConfirmation] = useState("");

  const age = Number(ageRetraite);
  const ageInvalide = !Number.isInteger(age) || age < 50 || age > 75;

  const handleEnregistrer = () => {
    if (ageInvalide) return;
    mettreAJourConfig({ ageRetraite: age });
    setConfirmation("Réglages enregistrés.");
  };

  const handleReinitialiser = () => {
    if (!confirm("Rétablir l'âge de retraite à sa valeur par défaut ?")) return;
    reinitialiserConfig();
    setAgeRetraite(String(configOM.ageRetraite));
    setConfirmation("Valeur par défaut rétablie.");
  };

  return (
    <div className="h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <h1 className={titrePageClass}>Administration</h1>

      <div className="w-full flex flex-col items-center justify-center gap-10">
        {/* Même parti pris que les boutons désactivés du Header : on affiche
            ce qui n'existe pas encore plutôt que de laisser croire le
            contraire. */}
        <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-700 text-sm">
          Cette page n&apos;est protégée par aucune authentification — les rôles ne sont pas encore
          implémentés. Toute personne connaissant l&apos;adresse peut modifier ces réglages.
        </div>

        {!estMonte ? (
          // Le rendu serveur ne connaît que les valeurs par défaut, le
          // navigateur celles de localStorage : afficher les premières
          // provoquerait un écart d'hydratation. On attend donc le client.
          <div className={carteClass}>
            <p className="text-sm text-gray-500">Chargement des réglages…</p>
          </div>
        ) : (
          <>
            <section className={carteClass}>
              <h2 className={legendClass}>Âge de départ en retraite</h2>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={50}
                  max={75}
                  value={ageRetraite}
                  onChange={(e) => {
                    setAgeRetraite(e.target.value);
                    setConfirmation("");
                  }}
                  className={`${inputClass} w-32 ${ageInvalide ? "border-red-500" : ""}`}
                />
                <span className="text-sm text-gray-600">ans</span>
              </div>
              <p className="text-sm text-gray-600">
                Un employé ayant atteint cet âge à la date de départ ne peut plus partir en
                mission.
              </p>
              {ageInvalide && (
                <p className="text-sm text-red-600">
                  Saisis un nombre entier d&apos;années compris entre 50 et 75.
                </p>
              )}
            </section>

            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleEnregistrer}
                disabled={ageInvalide}
                className="py-3 px-8 rounded-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300
                           disabled:cursor-not-allowed text-white shadow-xl shadow-blue-950/20
                           hover:scale-105 transition-all duration-300"
              >
                Enregistrer
              </button>
              <button
                onClick={handleReinitialiser}
                className="py-3 px-8 rounded-full bg-white hover:bg-blue-100 text-blue-800
                           shadow-md shadow-blue-950/10 transition-all duration-300"
              >
                Rétablir la valeur par défaut
              </button>
              {confirmation && <span className="text-green-700 text-sm">{confirmation}</span>}
            </div>
          </>
        )}
        
        <h1 className={titrePageClass}>Rapports</h1>

	      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl">
		{RAPPORTS.map((r) => (
		  <Link key={r.href} href={r.href} className={`${carteClass} hover:shadow-lg transition-shadow`}>
		    <h2 className="text-amber-600 font-semibold text-lg">{r.titre}</h2>
		    <p className="text-sm text-gray-600">{r.description}</p>
		  </Link>
		))}
	      </div>

	      <Link href="/om" className="text-blue-700 hover:underline text-sm w-fit">
		← Voir la liste complète des ordres de mission
	      </Link>
      </div>
    </div>
  );
}

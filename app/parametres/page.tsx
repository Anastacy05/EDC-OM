"use client";

import { useState } from "react";
import { configOM, mettreAJourConfig, reinitialiserConfig } from "@/lib/config";
import { useEstMonte } from "@/lib/useEstMonte";
import { inputClass, carteClass, legendClass, titrePageClass } from "@/lib/styles";

// DÉPLACÉ (21/08/2026) — le tableau RAPPORTS vit maintenant dans
// app/rapports/page.tsx, avec les adresses à jour (/rapports/... et non
// /admin/...). Le garder ici en aurait fait une seconde source de vérité,
// vouée à diverger de celle des onglets.
//
// `Link` n'est plus importé pour la même raison : plus aucun lien sur cette page.

export default function ParametresPage() {
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
    <div className="h-full w-full bg-blue-50 flex flex-col gap-8 p-6 sm:p-10">
      <h1 className={titrePageClass}>Paramètres</h1>

      <div className="w-full flex flex-col items-center justify-center gap-10">
        {/* COMMENTÉ (21/08/2026) — l'avertissement est devenu FAUX : la page est
            désormais protégée par `app/parametres/layout.tsx`
            (`exigerAdministrateur`), par le filtrage du proxy sur les préfixes
            réservés, et par les gardes du DAL. Vérifié : une session
            UTILISATEUR reçoit `307 → /?acces=refuse`, et un rôle forgé dans le
            jeton casse la signature.

            Le laisser afficherait une inquiétude infondée, ce qui est aussi
            trompeur que l'inverse.

        <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-red-700 text-sm">
          Cette page n&apos;est protégée par aucune authentification — les rôles ne sont pas encore
          implémentés. Toute personne connaissant l&apos;adresse peut modifier ces réglages.
        </div>
        */}

        {/* En revanche CECI reste vrai, et c'est la limite du moment : les
            réglages vivent dans `localStorage`, donc ils sont propres au
            navigateur de la personne connectée et ne s'appliquent pas aux
            autres. La bascule vers la table `configuration` est l'étape 9. */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 text-sm max-w-2xl">
          Ces réglages sont encore enregistrés <strong>dans ce navigateur</strong> et non
          en base : ils ne s&apos;appliquent qu&apos;à votre poste. La table{" "}
          <code>configuration</code> existe déjà en base et prendra le relais à
          l&apos;étape 9.
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

        {/* DÉPLACÉ (21/08/2026) — le bloc « Rapports » et le lien vers la liste
            des OM vivent maintenant dans app/rapports/page.tsx et dans les
            onglets du header. Cette page mélangeait deux natures : un réglage
            qui S'ÉCRIT et des rapports qui se LISENT. Les onglets les séparent,
            et le tableau RAPPORTS n'avait pas à être dupliqué ici. */}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { POSTES } from "@/lib/referentiels";
import { configOM, mettreAJourConfig, reinitialiserConfig } from "@/lib/config";
import { useEstMonte } from "@/lib/useEstMonte";
import { inputClass, carteClass, legendClass, titrePageClass } from "@/lib/styles";

// Le formulaire manipule des chaînes, pas des nombres : un <input type="number">
// vidé renvoie "" et non 0, et c'est justement cette distinction qui porte le
// sens "illimité" pour un quota. La conversion ne se fait qu'à l'enregistrement.
type QuotasSaisis = Record<string, string>;

function quotasDepuisConfig(): QuotasSaisis {
  const saisis: QuotasSaisis = {};
  for (const poste of POSTES) {
    const quota = configOM.tauxMissionAnnuelParPoste[poste.valeur];
    saisis[poste.valeur] = quota === undefined ? "" : String(quota);
  }
  return saisis;
}

export default function AdminPage() {
  const estMonte = useEstMonte();

  // Initialiseurs paresseux : lus une seule fois, après hydratation (le rendu
  // serveur ne franchit jamais le garde-fou `estMonte` ci-dessous, donc ces
  // valeurs par défaut du serveur ne sont jamais affichées).
  const [ageRetraite, setAgeRetraite] = useState(() => String(configOM.ageRetraite));
  const [quotas, setQuotas] = useState<QuotasSaisis>(quotasDepuisConfig);
  const [confirmation, setConfirmation] = useState("");

  const age = Number(ageRetraite);
  const ageInvalide = !Number.isInteger(age) || age < 50 || age > 75;

  // Un quota est soit vide (illimité), soit un entier positif. Tout le reste
  // bloque l'enregistrement plutôt que d'être silencieusement ignoré par
  // mettreAJourConfig.
  const posteInvalide = POSTES.find((poste) => {
    const brut = quotas[poste.valeur];
    if (brut === "") return false;
    const valeur = Number(brut);
    return !Number.isInteger(valeur) || valeur < 0;
  });

  const formulaireInvalide = ageInvalide || posteInvalide !== undefined;

  const handleEnregistrer = () => {
    if (formulaireInvalide) return;

    // Un champ vide n'écrit PAS 0 : la clé est omise, ce qui vaut "illimité"
    // (cf. quotaAnnuelPourPoste). Écrire Infinity serait pire : JSON.stringify
    // le transforme en null au moment de la sauvegarde.
    const tauxMissionAnnuelParPoste: Record<string, number> = {};
    for (const poste of POSTES) {
      const brut = quotas[poste.valeur];
      if (brut !== "") tauxMissionAnnuelParPoste[poste.valeur] = Number(brut);
    }

    mettreAJourConfig({ ageRetraite: age, tauxMissionAnnuelParPoste });
    setConfirmation("Réglages enregistrés.");
  };

  const handleReinitialiser = () => {
    if (!confirm("Rétablir l'âge de retraite et tous les quotas aux valeurs par défaut ?")) return;
    reinitialiserConfig();
    setAgeRetraite(String(configOM.ageRetraite));
    setQuotas(quotasDepuisConfig());
    setConfirmation("Valeurs par défaut rétablies.");
  };

  const changerQuota = (poste: string, valeur: string) => {
    setQuotas((precedents) => ({ ...precedents, [poste]: valeur }));
    setConfirmation("");
  };

  return (
    <div className="min-h-full w-full bg-blue-50 flex flex-col gap-8 p-10">
      <h1 className={titrePageClass}>Administration</h1>

      <div className="max-w-3xl w-full flex flex-col gap-6">
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

            <section className={carteClass}>
              <h2 className={legendClass}>Taux de mission annuel par poste</h2>
              <p className="text-sm text-gray-600">
                Nombre maximum de missions par année civile. Laisser un champ vide signifie
                « illimité » : aucun plafond ne sera appliqué à ce poste.
              </p>

              <div className="flex flex-col gap-2">
                {/* La liste vient du référentiel POSTES, jamais des clés de la
                    config : un poste sans quota (PCA, Membre du CA) doit rester
                    visible et donc configurable. */}
                {POSTES.map((poste) => {
                  const brut = quotas[poste.valeur];
                  const invalide = brut !== "" && (!Number.isInteger(Number(brut)) || Number(brut) < 0);
                  return (
                    <label
                      key={poste.valeur}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="text-gray-800">{poste.libelle}</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="illimité"
                        value={brut}
                        onChange={(e) => changerQuota(poste.valeur, e.target.value)}
                        className={`${inputClass} w-28 shrink-0 ${invalide ? "border-red-500" : ""}`}
                      />
                    </label>
                  );
                })}
              </div>

              {posteInvalide && (
                <p className="text-sm text-red-600">
                Le plafond de « {posteInvalide.libelle} » doit être un entier positif, ou vide
                pour « illimité ».
                </p>
              )}
            </section>

            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleEnregistrer}
                disabled={formulaireInvalide}
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
                Rétablir les valeurs par défaut
              </button>
              {confirmation && <span className="text-green-700 text-sm">{confirmation}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

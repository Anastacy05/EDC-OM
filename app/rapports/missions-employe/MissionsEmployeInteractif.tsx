"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Download, Printer } from "lucide-react";
import { formatFcfa } from "@/lib/analytics";
import type { LigneEmploye } from "@/lib/analytics";
import { carteClass, filtreInputClass } from "@/lib/styles";

/**
 * Rapport n° 8 — Missions par employé : « tableau paginé, cherchable,
 * exportable » (MODELE-DONNEES.md §11, catalogue). Reçoit les lignes déjà
 * agrégées par `missionsParEmploye` (lib/analytics.ts) côté serveur — cette
 * partie ne fait que chercher/trier/paginer/exporter EN MÉMOIRE, sur des
 * données déjà réduites à une ligne par employé (jamais une par
 * participation individuelle, cf. le commentaire de `missionsParEmploye`).
 */

type Colonne = "nom" | "nombreMissions" | "joursCumules" | "coutFcfa";

const TAILLE_PAGE = 20;

export default function MissionsEmployeInteractif({ lignes }: { lignes: LigneEmploye[] }) {
  const [recherche, setRecherche] = useState("");
  const [colonneTri, setColonneTri] = useState<Colonne>("nombreMissions");
  const [ordreDesc, setOrdreDesc] = useState(true);
  const [page, setPage] = useState(0);
  const [exportEnCours, setExportEnCours] = useState(false);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return lignes;
    return lignes.filter(
      (l) =>
        l.matricule.toLowerCase().includes(q) ||
        l.nom.toLowerCase().includes(q) ||
        l.prenoms.toLowerCase().includes(q)
    );
  }, [lignes, recherche]);

  const triees = useMemo(() => {
    const copie = [...filtrees];
    copie.sort((a, b) => {
      let diff: number;
      if (colonneTri === "nom") {
        diff = `${a.nom} ${a.prenoms}`.localeCompare(`${b.nom} ${b.prenoms}`);
      } else {
        diff = a[colonneTri] - b[colonneTri];
      }
      return ordreDesc ? -diff : diff;
    });
    return copie;
  }, [filtrees, colonneTri, ordreDesc]);

  const nbPages = Math.max(1, Math.ceil(triees.length / TAILLE_PAGE));
  const pageValide = Math.min(page, nbPages - 1);
  const pageAffichee = triees.slice(pageValide * TAILLE_PAGE, (pageValide + 1) * TAILLE_PAGE);

  const basculerTri = (colonne: Colonne) => {
    if (colonne === colonneTri) {
      setOrdreDesc((v) => !v);
    } else {
      setColonneTri(colonne);
      setOrdreDesc(true);
    }
    setPage(0);
  };

  const exporterXlsx = async () => {
    setExportEnCours(true);
    try {
      // Import dynamique : cette dépendance ne sert qu'au clic sur
      // « Exporter » — l'embarquer dans le bundle initial de la page
      // pénaliserait tout le monde pour une action que peu déclenchent.
      const ExcelJS = (await import("exceljs")).default;
      const classeur = new ExcelJS.Workbook();
      const feuille = classeur.addWorksheet("Missions par employé");
      feuille.columns = [
        { header: "Matricule", key: "matricule", width: 14 },
        { header: "Nom", key: "nom", width: 20 },
        { header: "Prénoms", key: "prenoms", width: 20 },
        { header: "Missions", key: "nombreMissions", width: 12 },
        { header: "Jours cumulés", key: "joursCumules", width: 14 },
        { header: "Coût plancher (FCFA)", key: "coutFcfa", width: 18 },
      ];
      feuille.getRow(1).font = { bold: true };
      // Export du tableau TEL QUE VU À L'ÉCRAN (triées + recherche
      // appliquée), pas du jeu complet — sinon un export après une recherche
      // surprendrait en contenant plus de lignes que ce qui était affiché.
      triees.forEach((l) => feuille.addRow(l));
      const buffer = await classeur.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = "missions-par-employe.xlsx";
      lien.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportEnCours(false);
    }
  };

  return (
    <div className={`${carteClass} max-w-4xl`}>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <input
          type="search"
          value={recherche}
          onChange={(e) => {
            setRecherche(e.target.value);
            setPage(0);
          }}
          placeholder="Chercher un nom, prénom ou matricule…"
          aria-label="Chercher un employé"
          className={`${filtreInputClass} max-w-xs`}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exporterXlsx}
            disabled={exportEnCours || triees.length === 0}
            className="flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 disabled:opacity-40"
          >
            <Download size={14} aria-hidden="true" />
            {exportEnCours ? "Export…" : "Exporter (.xlsx)"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900"
          >
            <Printer size={14} aria-hidden="true" />
            Imprimer
          </button>
        </div>
      </div>

      {triees.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {recherche ? "Aucun employé ne correspond à la recherche." : "Aucune mission engageante sur cette période."}
        </p>
      ) : (
        <>
          <table className="w-full text-sm">
            <caption className="sr-only">Missions par employé, triable et cherchable</caption>
            <thead>
              <tr className="text-left text-gray-600 border-b border-blue-100">
                <th className="py-2 font-medium">Matricule</th>
                <ColonneTriable libelle="Employé" colonne="nom" actuelle={colonneTri} desc={ordreDesc} onClic={basculerTri} />
                <ColonneTriable libelle="Missions" colonne="nombreMissions" actuelle={colonneTri} desc={ordreDesc} onClic={basculerTri} droite />
                <ColonneTriable libelle="Jours" colonne="joursCumules" actuelle={colonneTri} desc={ordreDesc} onClic={basculerTri} droite />
                <ColonneTriable libelle="Coût" colonne="coutFcfa" actuelle={colonneTri} desc={ordreDesc} onClic={basculerTri} droite />
              </tr>
            </thead>
            <tbody>
              {pageAffichee.map((l) => (
                <tr key={l.matricule} className="border-b border-blue-50 last:border-0">
                  <td className="py-2 font-mono text-xs">{l.matricule}</td>
                  <td className="py-2">
                    <Link
                      href={`/om?matricule=${encodeURIComponent(l.matricule)}`}
                      className="text-blue-700 underline hover:no-underline"
                    >
                      {l.nom} {l.prenoms}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{l.nombreMissions}</td>
                  <td className="py-2 text-right tabular-nums">{l.joursCumules}</td>
                  <td className="py-2 text-right tabular-nums">{formatFcfa(l.coutFcfa)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {nbPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600 print:hidden">
              <span>
                {pageValide * TAILLE_PAGE + 1}–{Math.min((pageValide + 1) * TAILLE_PAGE, triees.length)} sur{" "}
                {triees.length}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={pageValide === 0}
                  className="px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-40"
                >
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(nbPages - 1, p + 1))}
                  disabled={pageValide >= nbPages - 1}
                  className="px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ColonneTriable({
  libelle,
  colonne,
  actuelle,
  desc,
  onClic,
  droite,
}: {
  libelle: string;
  colonne: Colonne;
  actuelle: Colonne;
  desc: boolean;
  onClic: (colonne: Colonne) => void;
  droite?: boolean;
}) {
  const active = colonne === actuelle;
  return (
    <th className={`py-2 font-medium ${droite ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onClic(colonne)}
        className={`flex items-center gap-1 hover:text-blue-800 ${droite ? "ml-auto" : ""} ${active ? "text-blue-900 font-semibold" : ""}`}
        aria-label={`Trier par ${libelle}${active ? (desc ? ", décroissant" : ", croissant") : ""}`}
      >
        {libelle}
        <ArrowUpDown size={12} aria-hidden="true" className={active ? (desc ? "" : "rotate-180") : "opacity-40"} />
      </button>
    </th>
  );
}

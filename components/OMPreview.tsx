"use client";

import { type CSSProperties } from "react";
import { formatDateFR, formatHeureFR } from "@/lib/dateUtils";
import type { OrdreMissionDocument } from "@/types/om";

/**
 * Aperçu fac-similé de l'Ordre de Mission — reproduit visuellement les 2 pages
 * du template Word. Les clés de `om` correspondent EXACTEMENT aux balises
 * docxtemplater du template (template_om_avec_balises.docx), donc le même
 * objet sert à la fois à cet aperçu et à l'appel de génération du .docx.
 *
 * Un OM peut concerner plusieurs employés, mais ce composant affiche
 * toujours UN document individuel — c'est lib/buildDocument.ts qui aplatit
 * mission + participant en OrdreMissionDocument avant de le passer ici.
 *
 * Placer le logo dans /public/logo-edc.jpeg (fichier fourni à côté de ce composant).
 *
 * Le tableau VISAS (page 2) est généré dynamiquement à partir de `om.visas`
 * (un objet par étape de mission) — comme la boucle {#visas}...{/visas} côté docxtemplater.
 *
 * La section "Règlement définitif" n'est pas éditable : elle est remplie à la
 * main par l'agent au retour de mission, hors périmètre de l'application.
 */

const sampleOM: OrdreMissionDocument = {
  numeroOM: "0142",
  nom: "NKOLO ATANGANA",
  prenoms: "Stacy Julie",
  grade: "Ingénieur Stagiaire",
  affectation: "DEX",
  matricule: "22P582",
  situationFamille: "Célibataire",
  indice: "410",
  destination: "Douala",
  viaPassage: "Edéa",
  motif: "Mission technique de supervision du projet GANDAL",
  financement: "Budget interne EDC",
  moyenTransport: "Véhicule de service",
  dateDepart: "28/07/2026",
  dateRetour: "31/07/2026",
  nomEmetteur: "MBO Alain",
  gradeEmetteur: "Ingénieur",
  fonctionEmetteur: "Chef de Département DRH",
  lieuEmission: "Yaoundé",
  dateEmission: "26/07/2026",
  chapitre: "65",
  article: "12",
  paragraphe: "03",
  exercice: "2026",
  exerciceAnnee: "26",
  visas: [
    {
      departDe: "Yaoundé",
      departLe: "2026-07-28",
      departHeure: "07:00",
      arriveeA: "Edéa",
      arriveeLe: "2026-07-28",
      arriveeHeure: "10:30",
    },
    {
      departDe: "Edéa",
      departLe: "2026-07-28",
      departHeure: "11:00",
      arriveeA: "Douala",
      arriveeLe: "2026-07-28",
      arriveeHeure: "13:00",
    },
  ],
};

interface FieldProps {
  field: string;
  value?: string;
  wide?: boolean;
  style?: CSSProperties;
}

function Field({ field, value, wide, style }: FieldProps) {
  const empty = value === undefined || value === null || value === "";
  return (
    <span className={`field${empty ? " empty" : ""}`} data-field={field} style={style}>
      {empty ? "……" : value}
      <style jsx>{`
        .field {
          border-bottom: 1px dotted #444;
          display: ${wide ? "block" : "inline-block"};
          width: ${wide ? "100%" : "auto"};
          min-width: 40px;
          min-height: ${wide ? "16px" : "auto"};
          padding: 0 2px;
          color: #002f6c;
          font-weight: 600;
        }
        .empty {
          color: #b6b6b6;
          font-weight: 400;
        }
      `}</style>
    </span>
  );
}

interface OMPreviewProps {
  om?: OrdreMissionDocument;
}

export default function OMPreview({ om = sampleOM }: OMPreviewProps) {
  const visas = om.visas || [];

  return (
    <div className="wrapper">
      {/* ============ PAGE 1 ============ */}
      <div className="page">
        <div className="p1-header">
          <div className="p1-logo">
            <img src="/logo-edc.jpeg" alt="EDC" />
            <div className="name">
              ELECTRICITY
              <br />
              DEVELOPMENT
              <br />
              CORPORATION
            </div>
          </div>
          <div className="p1-country">
            RÉPUBLIQUE DU CAMEROUN
            <div className="sub">Paix – Travail – Patrie</div>
          </div>
        </div>

        <div className="p1-title">
          <h1>ORDRE DE MISSION</h1>
          <div className="sub">MISSION ORDER</div>
          <div>-----------</div>
          <div className="num">
            N° <Field field="numeroOM" value={om.numeroOM} />/EDC/DG/DRH/SDARHAS
          </div>
        </div>

        <div className="p1-row">
          M. <Field field="nom" value={om.nom} wide />
          <div className="p1-caption">
            <b>
              Nom – <i>Name</i>
            </b>
          </div>
        </div>

        <div className="p1-row">
          <Field field="prenoms" value={om.prenoms} wide />
          <div className="p1-caption">
            <b>
              Prénoms – <i>First Names</i>
            </b>
          </div>
        </div>

        <div className="p1-row">
          Grade : <Field field="grade" value={om.grade} style={{ minWidth: 220 }} />
          &nbsp;&nbsp;Affectation : <Field field="affectation" value={om.affectation} />
        </div>

        <div className="p1-row">
          Matricule : <Field field="matricule" value={om.matricule} style={{ minWidth: 90 }} />
          &nbsp;&nbsp;Situation de famille :{" "}
          <Field field="situationFamille" value={om.situationFamille} />
          &nbsp;&nbsp;Indice <Field field="indice" value={om.indice} style={{ minWidth: 60 }} />
          <div className="p1-caption" style={{ maxWidth: 560 }}>
            <i>Service number</i>
            <i>Family situation</i>
            <i>Index</i>
          </div>
        </div>

        <div className="p1-row">
          Se rendra à : <Field field="destination" value={om.destination} style={{ minWidth: 160 }} />
          &nbsp;en passant par :{" "}
          <Field field="viaPassage" value={om.viaPassage} style={{ minWidth: 160 }} />
          <div className="p1-caption" style={{ maxWidth: 420 }}>
            <i>Will visit</i>
            <i>via</i>
          </div>
        </div>

        <div className="p1-row">
          Motif et références :
          <div className="p1-caption" style={{ maxWidth: "none", display: "block" }}>
            <i>Purpose and references</i>
          </div>
          <Field field="motif" value={om.motif} wide />
        </div>

        <div className="p1-row">
          Financement : <Field field="financement" value={om.financement} wide />
          <div className="p1-caption" style={{ maxWidth: "none" }}>
            <i>Financing</i>
          </div>
        </div>

        <div className="p1-row">
          Moyen de transport : <Field field="moyenTransport" value={om.moyenTransport} wide />
          <div className="p1-caption" style={{ maxWidth: "none" }}>
            <i>Means of transport</i>
          </div>
        </div>

        <div className="p1-row two-col" style={{ maxWidth: 600 }}>
          <div>
            Date de départ : <Field field="dateDepart" value={formatDateFR(om.dateDepart)} />
          </div>
          <div>
            Date de retour : <Field field="dateRetour" value={formatDateFR(om.dateRetour)} />
          </div>
        </div>
        <div className="p1-caption" style={{ maxWidth: 600, marginTop: -8 }}>
          <i>Date of departure</i>
          <i>Date of return</i>
        </div>

        <div className="p1-row" style={{ marginTop: 18 }}>
          <b>DELIVRE PAR NOUS</b> <Field field="nomEmetteur" value={om.nomEmetteur} /> –{" "}
          <Field field="gradeEmetteur" value={om.gradeEmetteur} />
          <div className="p1-caption" style={{ maxWidth: 520 }}>
            <i>nom – name</i>
            <i>grade – rank</i>
          </div>
        </div>

        <div className="p1-row">
          Fonction – <i>function</i> :{" "}
          <Field field="fonctionEmetteur" value={om.fonctionEmetteur} style={{ minWidth: 260 }} />
        </div>

        <div className="p1-row">
          <b>A</b> (At) <Field field="lieuEmission" value={om.lieuEmission} style={{ minWidth: 140 }} />
          , <b>le</b> (on the){" "}
          <Field field="dateEmission" value={formatDateFR(om.dateEmission)} style={{ minWidth: 120 }} />
        </div>

        <div className="signatures">
          <div>
            SIGNATURE
            <br />
            DIRECTEUR DES RESSOURCES HUMAINES
          </div>
          <div>
            SIGNATURE
            <br />
            DIRECTEUR GENERAL
          </div>
        </div>

        <div className="footer-legal">
          Electricity Development Corporation _ SA — RC/YAO/2008/B/1227 _ N° contribuable :
          M1106000025048Z
          <br />
          Capital social : 15 000 000 000 FCFA — Siège social : BP 15 111 Yaoundé — Tél. : +(237) 222
          23 19 30 _ Fax : +(237)222 23 11 13 — www.edc.cm
        </div>
      </div>

      {/* ============ PAGE 2 ============ */}
      <div className="page">
        <table className="doc-table">
          <tbody>
            <tr>
              <td colSpan={3}>
                <div className="small">
                  REPUBLIQUE DU CAMEROUN
                  <br />
                  <i>REPUBLIC OF CAMEROON</i>
                </div>
                <div className="center small">
                  Paix – Travail – Patrie
                  <br />
                  <i>Peace – Work – Fatherland</i>
                </div>
                <div className="center bold small" style={{ marginTop: 6 }}>
                  IMPUTATION BUDGETAIRE
                </div>
                <div className="center small">
                  Chap. <Field field="chapitre" value={om.chapitre} style={{ minWidth: 36 }} />
                  &nbsp;Art. <Field field="article" value={om.article} style={{ minWidth: 36 }} />
                  &nbsp;Parag.{" "}
                  <Field field="paragraphe" value={om.paragraphe} style={{ minWidth: 36 }} />
                </div>
                <div className="center small">
                  Exercice <Field field="exercice" value={om.exercice} style={{ minWidth: 50 }} />
                  &nbsp;20
                  <Field field="exerciceAnnee" value={om.exerciceAnnee} style={{ minWidth: 24 }} />
                </div>
              </td>
              <td colSpan={5} className="center">
                <div className="bold" style={{ fontSize: 15 }}>
                  FEUILLE DE DEPLACEMENT
                </div>
                <div className="small">TRAVELLING WARRANT</div>
                <div className="small">======o======</div>
                <div className="small" style={{ marginTop: 6 }}>
                  DEPLACEMENT (1) &nbsp;
                  <span title="Case à cocher — hors périmètre balises texte">▢</span> TEMPORAIRE
                  &nbsp;&nbsp;
                  <span title="Case à cocher — hors périmètre balises texte">▢</span> DEFINITIF
                </div>
              </td>
              <td colSpan={2} className="center">
                <div className="p2-top-logo">
                  <img src="/logo-edc.jpeg" alt="EDC" />
                </div>
                <div className="bold small">
                  ELECTRICITY DEVELOPMENT
                  <br />
                  CORPORATION
                </div>
              </td>
            </tr>

            <tr>
              <td colSpan={5} className="center bold">
                V I S A S
              </td>
              <td colSpan={4} rowSpan={2} className="center small">
                CERTIFICATION SUCCESSIVE
                <br />
                Des conditions de logement et de nourriture
                <br />
                <i>Successive certification of board and lodging conditions</i>
              </td>
              <td rowSpan={2} className="center small">
                OBSERVATIONS
                <br />
                <i>Remarks</i>
              </td>
            </tr>
            <tr>
              <td className="center small">
                AU DEPART
                <br />
                <i>On departure</i>
              </td>
              <td colSpan={4} className="center small">
                A L'ARRIVEE
                <br />
                <i>On arrival</i>
              </td>
            </tr>

            {visas.map((v, i) => (
              <tr key={i}>
                <td className="small">
                  <div className="leg-block">
                    de <Field field={`visas.${i}.departDe`} value={v.departDe} />
                  </div>
                  <div className="leg-block">
                    le <Field field={`visas.${i}.departLe`} value={formatDateFR(v.departLe)} />
                  </div>
                  <div className="leg-block">
                    à <Field field={`visas.${i}.departHeure`} value={formatHeureFR(v.departHeure)} /> heures
                  </div>
                </td>
                <td colSpan={4} className="small">
                  <div className="leg-block">
                    à <Field field={`visas.${i}.arriveeA`} value={v.arriveeA} />
                  </div>
                  <div className="leg-block">
                    le <Field field={`visas.${i}.arriveeLe`} value={formatDateFR(v.arriveeLe)} />
                  </div>
                  <div className="leg-block">
                    à <Field field={`visas.${i}.arriveeHeure`} value={formatHeureFR(v.arriveeHeure)} /> heures
                  </div>
                </td>
                <td colSpan={4} className="center italic small">
                  Signature (et cachet – and official stamp)
                </td>
                <td></td>
              </tr>
            ))}

            <tr>
              <td colSpan={10} className="locked-banner">
                REGLEMENT DEFINITIF – rempli manuellement par l'agent au retour de mission (non géré
                par l'application)
              </td>
            </tr>
            <tr>
              <td colSpan={2} rowSpan={6} className="small">
                INDEMNITE JOURNALIERE
                <br />
                <i>
                  <b>Daily allowance</b>
                </i>
                <br />
                <br />
                NORMAL – Normal …………
                <br />
                REDUITE - Reduced …………
                <br />
                PARTIELLE – Partiel …………
                <br />
                <br />
                AVANCES OU ACOMPTES A DEDUIRE
                <br />
                <i>Advances of instalments to be deducted</i> …………
                <br />
                <br />
                RESTE A PAYER
                <br />
                <i>Remainder to be paid</i> …………
              </td>
              <td colSpan={2} className="center small">
                NOMBRE
                <br />
                <i>
                  <b>Number</b>
                </i>
              </td>
              <td colSpan={2} className="center small">
                TAUX
                <br />
                <i>
                  <b>Rate</b>
                </i>
              </td>
              <td className="center small">
                DECOMPTE
                <br />
                <i>
                  <b>Sub-total</b>
                </i>
              </td>
              <td colSpan={3} rowSpan={5} className="small">
                ARRETE DECOMPTE FINAL A LA SOMME DE :
                <br />
                <i>Final balance concluded at the sum of</i>
                <br />
                <br />A (<i>At</i>) ……………… le (on the) ………………
              </td>
            </tr>
            <tr>
              <td colSpan={2}>&nbsp;</td>
              <td colSpan={2}>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={2}>&nbsp;</td>
              <td colSpan={2}>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={2}>&nbsp;</td>
              <td colSpan={2}>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={2}>&nbsp;</td>
              <td colSpan={2}>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={8}>
                <b>TOTAL ……………..&nbsp;&nbsp;Le (The) ……………………</b>
                <div className="center" style={{ marginTop: 6 }}>
                  (Signature)
                </div>
                <div style={{ marginTop: 8 }}>POUR ACQUIS Received ……… =</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .wrapper {
          font-family: Arial, Helvetica, sans-serif;
        }
        .page {
          background: #fff;
          width: 794px;
          min-height: 1123px;
          margin: 0 auto 24px;
          padding: 36px 42px;
          position: relative;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
          font-size: 12.5px;
          color: #111;
        }
        .p1-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #f7941e;
          padding-bottom: 10px;
          margin-bottom: 22px;
        }
        .p1-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .p1-logo img {
          width: 58px;
        }
        .p1-logo .name {
          font-size: 10.5px;
          color: #002f6c;
          font-weight: 700;
          line-height: 1.15;
        }
        .p1-country {
          text-align: right;
          font-size: 11px;
          color: #002f6c;
          font-weight: 700;
        }
        .p1-country .sub {
          font-weight: 400;
          font-style: italic;
        }
        .p1-title {
          text-align: center;
          margin: 18px 0 22px;
        }
        .p1-title h1 {
          font-size: 21px;
          letter-spacing: 4px;
          margin: 0;
        }
        .p1-title .sub {
          font-size: 12px;
          letter-spacing: 1px;
        }
        .p1-title .num {
          font-size: 13px;
          font-weight: 700;
          margin-top: 6px;
        }
        .p1-row {
          margin-bottom: 14px;
        }
        .p1-caption {
          font-size: 10px;
          font-style: italic;
          display: flex;
          justify-content: space-between;
          max-width: 520px;
        }
        .p1-caption b {
          font-style: normal;
        }
        .two-col {
          display: flex;
          justify-content: space-between;
          gap: 24px;
        }
        .signatures {
          display: flex;
          margin-top: 26px;
          border: 2px solid #000;
        }
        .signatures > div {
          flex: 1;
          text-align: center;
          padding: 8px 10px 60px;
          font-size: 11px;
          font-weight: 700;
          text-decoration: underline;
        }
        .signatures > div:first-child {
          border-right: 2px solid #000;
        }
        .footer-legal {
          position: absolute;
          bottom: 24px;
          left: 42px;
          right: 42px;
          font-size: 8.5px;
          color: #002f6c;
          border-top: 1px solid #f7941e;
          padding-top: 6px;
        }
        .doc-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #000;
          font-size: 10px;
        }
        .doc-table td {
          border: 1px solid #000;
          padding: 4px 6px;
          vertical-align: top;
        }
        .center {
          text-align: center;
        }
        .bold {
          font-weight: 700;
        }
        .small {
          font-size: 9px;
        }
        .italic {
          font-style: italic;
        }
        .leg-block {
          margin-bottom: 3px;
        }
        .p2-top-logo {
          text-align: center;
        }
        .p2-top-logo img {
          width: 40px;
        }
        .locked-banner {
          text-align: center;
          font-size: 10px;
          font-style: italic;
          padding: 4px;
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
        }
      `}</style>
    </div>
  );
}

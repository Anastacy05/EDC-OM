import { NextRequest, NextResponse } from "next/server";
import { generateOmDocx } from "@/lib/generateOmDocx";
import { lireSession } from "@/lib/auth/garde";
import { lireDocumentOM, ErreurOM } from "@/lib/data/om";
import { lignesVisasVierges } from "@/lib/buildDocument";
import { formatDateFR } from "@/lib/dateUtils";
import { normaliserMatricule } from "@/lib/data/employes.validation";
import { numeroPourGabarit } from "@/lib/numeroOM";
import type { OrdreMissionDocument } from "@/types/om";

// Obligatoire : docxtemplater/pizzip ont besoin de Node (fs, buffers), pas d'Edge.
export const runtime = "nodejs";

/**
 * Génération du document Word d'un ordre de mission.
 *
 * ── LA faille que cette route portait ────────────────────────────────────────
 *
 * Elle acceptait **l'objet complet du document dans le corps de la requête**, et se
 * contentait de le passer au gabarit. N'importe quel utilisateur authentifié pouvait
 * donc obtenir un ordre de mission Word au contenu de son choix : son nom, la
 * destination qu'il voulait, un numéro inventé, le montant qu'il souhaitait. Le
 * document sortait avec la mise en forme officielle de l'EDC, prêt à être présenté.
 *
 * L'authentification seule n'y changeait rien : elle vérifiait QUI appelait, pas CE
 * QU'il demandait. La route reçoit maintenant `{ idOrdreMission, matricule }` et lit
 * tout en base, sous la garde du DAL (`peutAccederAuMatricule`).
 *
 * ── Le téléchargement reste TOUJOURS permis ─────────────────────────────────
 *
 * Quel que soit le statut, `REFUSE` et `EXPIRE` compris. Le restreindre empêcherait
 * d'obtenir la signature du Directeur général, qui est justement l'étape suivante
 * d'un OM en attente — l'application bloquerait le processus qu'elle sert.
 *
 * C'est la **MENTION** portée sur le document qui protège : un OM refusé sort avec
 * « REFUSÉ — SANS VALEUR » imprimé dans son objet. Le gabarit n'a pas de balise
 * dédiée, elle est donc préfixée au motif — la seule solution sans reprendre le
 * `.docx`, et elle est visible à l'endroit qu'on lit en premier.
 *
 * ── Ce qui reste à trancher (étape 10) ──────────────────────────────────────
 *
 * ⚠️ La spécification veut aussi que l'OM soit téléchargeable **hors ligne**
 * (MODELE-DONNEES.md §1), ce qu'un Route Handler ne permet pas. Les deux exigences
 * se rejoignent mal : lecture en base (serveur) contre hors ligne (navigateur).
 * `docxtemplater` fonctionne dans le navigateur — c'est son usage d'origine — donc
 * la bascule est possible, mais elle rendrait au client le contrôle du contenu. Le
 * compromis probable : générer côté navigateur à partir de données **déjà
 * synchronisées**, jamais à partir d'une saisie.
 */

/** Corps attendu. Tout le reste est lu en base — rien d'autre n'est accepté. */
interface CorpsDemande {
  idOrdreMission?: unknown;
  matricule?: unknown;
}

function refus(message: string, statut: number) {
  return NextResponse.json(
    { error: message },
    // `no-store` : un document nominatif ne doit pas rester dans un cache
    // intermédiaire, ni la réponse d'erreur qui révèle l'existence d'une pièce.
    { status: statut, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  // Garde d'authentification. Le proxy en pose déjà une en amont, mais elle ne
  // suffit pas : la doc prévient que « A matcher change or a refactor that moves a
  // Server Function to a different route can silently remove Proxy coverage. Always
  // verify authentication and authorization inside each Server Function ». Un Route
  // Handler est exactement dans ce cas.
  //
  // `lireSession()` et non `exigerSession()` : cette dernière REDIRIGE, ce qui
  // renverrait du HTML à un client qui attend un `.docx`. Ici on répond 401.
  const session = await lireSession();
  if (!session) return refus("Non authentifié.", 401);

  let corps: CorpsDemande;
  try {
    corps = await request.json();
  } catch {
    return refus("Corps de requête illisible.", 400);
  }

  const idOrdreMission = String(corps.idOrdreMission ?? "").trim();
  const matricule = normaliserMatricule(String(corps.matricule ?? ""));

  if (!idOrdreMission || !matricule) {
    return refus(
      "Requête incomplète : `idOrdreMission` et `matricule` sont attendus. " +
        "Le contenu du document n'est plus accepté dans le corps de la requête.",
      400
    );
  }

  // ⚠️ `/^\d+$/` avant `BigInt` : `BigInt("0x10")` vaut 16 et `BigInt(" 12 ")` vaut
  // 12. Un identifiant écrit autrement désignerait donc une ligne différente de
  // celle que l'appelant croit demander.
  if (!/^\d+$/.test(idOrdreMission)) {
    return refus("Identifiant d'ordre de mission invalide.", 400);
  }

  let document: Awaited<ReturnType<typeof lireDocumentOM>>;
  try {
    document = await lireDocumentOM(idOrdreMission, matricule);
  } catch (erreur) {
    // `interdit` : le matricule demandé n'est pas celui de l'appelant, et il n'est
    // pas administrateur. 403 et non 404 — l'appelant a bien identifié une pièce,
    // il n'y a simplement pas droit.
    if (erreur instanceof ErreurOM && erreur.genre === "interdit") {
      return refus("Vous n'avez pas accès à ce document.", 403);
    }
    console.error("[generate-om] lecture impossible :", erreur);
    return refus("Le service est momentanément indisponible.", 503);
  }

  if (!document) return refus("Ordre de mission introuvable.", 404);

  // ── Composition de l'objet du gabarit ──────────────────────────────────────
  //
  // Les dates sont converties en JJ/MM/AAAA **ici** et non par le client : c'est le
  // format du document, et le laisser au navigateur laissait passer des formats
  // divergents selon l'écran appelant.
  const pourGabarit: OrdreMissionDocument = {
    // ⚠️ Le COMPTEUR seul, pas la valeur stockée. La balise du gabarit est
    // `N° {numeroOM}/EDC/DG/DRH/SDARHAS` : lui passer « 0042/2026 » imprimait
    // « N° 0042/2026/EDC/DG/DRH/SDARHAS », l'année s'intercalant au milieu du
    // suffixe administratif. Elle est dans la colonne pour l'unicité d'une année
    // sur l'autre, pas pour figurer sur la pièce. Constaté le 24/08/2026.
    numeroOM: numeroPourGabarit(document.numeroOM),
    nom: document.nom,
    prenoms: document.prenoms,
    grade: document.grade,
    affectation: document.affectation,
    matricule: document.matricule,
    situationFamille: document.situationFamille,
    indice: document.indice ?? undefined,
    destination: document.destination,
    viaPassage: document.viaPassage ?? undefined,
    // La mention préfixée au motif : le gabarit n'a pas de balise pour elle, et
    // c'est ce qui rend un document sans valeur reconnaissable sur le papier.
    motif: document.mentionStatut
      ? `${document.mentionStatut} — ${document.motif}`
      : document.motif,
    financement: document.financement ?? undefined,
    moyenTransport: document.moyenTransport ?? undefined,
    dateDepart: formatDateFR(document.dateDepart),
    dateRetour: formatDateFR(document.dateRetour),
    nomEmetteur: document.nomEmetteur,
    gradeEmetteur: document.gradeEmetteur ?? undefined,
    fonctionEmetteur: document.fonctionEmetteur,
    lieuEmission: document.lieuEmission,
    dateEmission: formatDateFR(document.dateEmission),
    chapitre: document.chapitre ?? undefined,
    article: document.article ?? undefined,
    paragraphe: document.paragraphe ?? undefined,
    exercice: document.exercice ?? undefined,
    exerciceAnnee: document.exerciceAnnee ?? undefined,
    // Toujours trois lignes vierges : une boucle `{#visas}` vide FAIT DISPARAÎTRE
    // le tableau imprimé, alors que ses cases doivent rester présentes pour le
    // remplissage manuel au retour de mission.
    visas: lignesVisasVierges(),
  };

  let buffer: Buffer;
  try {
    buffer = generateOmDocx(pourGabarit);
  } catch (erreur) {
    console.error("[generate-om] génération impossible :", erreur);
    return refus("Échec de la génération du document.", 500);
  }

  // Le nom de fichier porte le NUMÉRO d'OM : c'est l'identifiant de la pièce, donc
  // ce sous quoi elle sera classée. Le filtre est strict — le numéro contient un
  // « / », que le système de fichiers lirait comme un séparateur de dossier, et un
  // retour à la ligne injecté couperait l'en-tête HTTP en deux.
  const nomSain = document.numeroOM.replace(/[^a-zA-Z0-9_-]/g, "-") || "om";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="ordre_mission_${nomSain}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}

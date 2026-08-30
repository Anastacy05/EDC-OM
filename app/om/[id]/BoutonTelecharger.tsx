"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { boutonPrimaire } from "@/lib/styles";

/**
 * Téléchargement du document Word.
 *
 * ── Ce qui change dans le corps de la requête ────────────────────────────────
 *
 * Il ne contient plus que `{ idOrdreMission, matricule }`. Avant, l'écran envoyait
 * **l'objet complet du document** — donc n'importe quel utilisateur connecté
 * pouvait obtenir un ordre de mission Word au contenu de son choix, à son nom, pour
 * la destination et le montant qu'il voulait. La route lit maintenant la
 * participation en base et vérifie l'accès au matricule.
 *
 * ── Pourquoi ce composant reste client ──────────────────────────────────────
 *
 * `fetch` puis `URL.createObjectURL` : il faut un blob et un clic simulé. Un lien
 * `<a href>` vers la route serait plus simple mais imposerait un GET, donc le
 * matricule dans l'URL — visible dans l'historique et les journaux du serveur.
 *
 * ── Le téléchargement reste TOUJOURS permis ─────────────────────────────────
 *
 * Quel que soit le statut, y compris `REFUSE` et `EXPIRE`. Le restreindre
 * empêcherait d'obtenir la signature du DG, qui est justement l'étape suivante d'un
 * OM en attente. C'est la MENTION portée sur le document qui protège, pas
 * l'interdiction de l'imprimer.
 */
export default function BoutonTelecharger({
  idOM,
  matricule,
  numeroOM,
}: {
  idOM: string;
  matricule: string;
  numeroOM: string;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const telecharger = async () => {
    setEnCours(true);
    setErreur("");
    try {
      const reponse = await fetch("/api/generate-om", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idOrdreMission: idOM, matricule }),
      });

      if (!reponse.ok) {
        // Les trois cas se distinguent, parce qu'ils ne demandent pas la même
        // réaction : se reconnecter, renoncer, ou signaler un incident.
        const message =
          reponse.status === 401
            ? "Votre session a expiré. Reconnectez-vous."
            : reponse.status === 403
              ? "Vous n'avez pas accès à ce document."
              : reponse.status === 404
                ? "Cet ordre de mission n'existe plus."
                : "La génération du document a échoué. Réessayez, ou signalez-le à l'équipe technique.";
        setErreur(message);
        return;
      }

      const blob = await reponse.blob();
      const url = URL.createObjectURL(blob);
      const lien = window.document.createElement("a");
      lien.href = url;
      // Le numéro d'OM plutôt que le matricule : c'est l'identifiant de la PIÈCE,
      // donc ce sous quoi elle sera classée. Le `/` du numéro est remplacé, sinon
      // le système de fichiers le lit comme un séparateur de dossier.
      lien.download = `ordre_mission_${numeroOM.replace(/\//g, "-")}.docx`;
      lien.click();
      URL.revokeObjectURL(url);
    } catch {
      setErreur(
        "La génération du document a échoué : le serveur est peut-être injoignable. Réessayez."
      );
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={telecharger}
        disabled={enCours}
        className={`${boutonPrimaire} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Download size={18} aria-hidden="true" />
        {enCours ? "Génération…" : "Télécharger (Word)"}
      </button>

      {erreur && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-900">
          {erreur}
        </p>
      )}
    </div>
  );
}

import { AlertTriangle } from "lucide-react";

/**
 * Avertissement : ces chiffres viennent des données de DÉMONSTRATION.
 *
 * ⚠️ PLUS UTILISÉ depuis le 26/08/2026 (étape 14, MODELE-DONNEES.md §13) : les
 * trois pages `/rapports/*` lisent maintenant lib/data/rapports.ts, donc la
 * base réelle — l'affichage de cet encart serait devenu FAUX dans l'autre
 * sens (il ferait croire à des données fictives alors qu'elles sont réelles).
 * Son rendu a été commenté dans chacune des trois pages, avec un renvoi ici.
 *
 * Conservé (non supprimé, convention du projet §0) : le composant réapparaîtra
 * peut-être sous une autre forme si un jour un rapport combine base et jeu de
 * démonstration (environnement de recette, par exemple).
 *
 * ── Ce que cet encart signalait, pour mémoire ─────────────────────────────
 *
 * Depuis l'étape 8, les ordres de mission sont enregistrés **en base**. Or
 * `lib/analytics.ts` lisait `mockOMs`, donc `localStorage`. Les trois écrans
 * de rapports comptaient par conséquent des missions fictives, et **ne comptaient
 * aucune** des missions réelles.
 *
 * Sans cet encart, le défaut aurait été invisible : les graphiques s'affichent, les
 * chiffres ont l'air plausibles, et rien ne signale qu'ils sont faux. Un état
 * présenté à une direction sur cette base aurait été pire qu'un écran vide — un écran
 * vide se remarque, un chiffre faux se cite.
 */
export default function AvertissementDonneesDemo() {
  return (
    <div
      // `role="note"` : ce n'est pas une alerte au sens d'un incident à traiter, mais
      // une réserve permanente sur le contenu de la page. `role="alert"` serait
      // annoncé en interrompant la lecture à chaque visite, ce qui deviendrait
      // vite du bruit.
      role="note"
      className="flex items-start gap-3 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3
                 text-sm text-amber-900"
    >
      <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p>
        <strong>Ces chiffres sont des données de démonstration.</strong> Les ordres de
        mission sont désormais enregistrés en base, mais les rapports lisent encore le
        jeu d&apos;essai du navigateur : ils ne reflètent donc{" "}
        <strong>aucune mission réelle</strong>. Ne les utilisez pas pour un état
        transmis à la direction. La bascule sur les données réelles est prévue à
        l&apos;étape 12.
      </p>
    </div>
  );
}

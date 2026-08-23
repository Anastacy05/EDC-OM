import { AlertTriangle } from "lucide-react";

/**
 * Avertissement : ces chiffres viennent des données de DÉMONSTRATION.
 *
 * ── Pourquoi cet encart est nécessaire, et pas seulement souhaitable ─────────
 *
 * Depuis l'étape 8, les ordres de mission sont enregistrés **en base**. Or
 * `lib/analytics.ts` lit toujours `mockOMs`, donc `localStorage`. Les trois écrans
 * de rapports comptent par conséquent des missions fictives, et **ne comptent aucune
 * des missions réelles**.
 *
 * Sans cet encart, le défaut serait invisible : les graphiques s'affichent, les
 * chiffres ont l'air plausibles, et rien ne signale qu'ils sont faux. Un état
 * présenté à une direction sur cette base serait pire qu'un écran vide — un écran
 * vide se remarque, un chiffre faux se cite.
 *
 * La bascule est prévue à l'étape 12 (`lib/analytics.ts` sur la base), et
 * `lib/mockData.ts` sera commenté à l'étape 14, quand plus rien n'en dépendra.
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

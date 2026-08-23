import { AlertTriangle, CheckCircle2, Clock, CircleSlash, XCircle, Hourglass } from "lucide-react";
import { libelleStatutParticipation } from "@/lib/data/om.validation";

/**
 * Badge d'état d'une participation.
 *
 * ── Pourquoi les cinq statuts, et pourquoi une icône ────────────────────────
 *
 * `statutStyles` (ancien app/om/page.tsx) n'en connaissait que TROIS. `REFUSE` et
 * `EXPIRE` existent en base depuis l'étape 8 : ils produisaient un badge **sans
 * aucun style**, donc du texte brut au milieu de pastilles colorées — l'état le
 * plus important à repérer était le moins visible.
 *
 * Chaque état porte une ICÔNE en plus de la couleur, comme la liste du personnel.
 * La raison est la même, et elle est mesurée : entre le rouge et le vert de cette
 * palette, l'écart tombe à ΔE 4,7 en deutéranopie, sous le plancher de 6. Un état
 * signalé par la seule couleur n'est donc pas lisible par tout le monde.
 *
 * ── Le blocage l'emporte sur le statut ──────────────────────────────────────
 *
 * Une participation bloquée est `EN_ATTENTE` en base, mais ce n'est pas ce qu'il
 * faut lire : « en attente » suggère qu'il n'y a qu'à confirmer, alors que la
 * confirmation est justement **impossible** (contrainte
 * `part_blocage_interdit_confirmation`). Le badge annonce donc le conflit.
 */
const APPARENCE: Record<
  string,
  { classe: string; Icone: typeof Clock; libelle?: string }
> = {
  EN_ATTENTE: { classe: "bg-amber-100 text-amber-900 border-amber-300", Icone: Clock },
  CONFIRME: { classe: "bg-green-100 text-green-900 border-green-300", Icone: CheckCircle2 },
  ANNULE: { classe: "bg-slate-200 text-slate-700 border-slate-300", Icone: CircleSlash },
  REFUSE: { classe: "bg-red-100 text-red-900 border-red-300", Icone: XCircle },
  EXPIRE: { classe: "bg-orange-100 text-orange-900 border-orange-300", Icone: Hourglass },
};

const BLOQUE = {
  classe: "bg-red-100 text-red-900 border-red-400",
  Icone: AlertTriangle,
  libelle: "Conflit à arbitrer",
};

export default function BadgeStatut({
  statut,
  bloque = false,
}: {
  statut: string;
  bloque?: boolean;
}) {
  const apparence = bloque
    ? BLOQUE
    : (APPARENCE[statut] ?? {
        // Statut inconnu : on affiche le code brut plutôt que rien. Un état qu'on
        // n'a pas prévu doit rester VISIBLE, pas disparaître silencieusement.
        classe: "bg-slate-100 text-slate-800 border-slate-300",
        Icone: AlertTriangle,
      });

  const { Icone } = apparence;
  const texte =
    ("libelle" in apparence && apparence.libelle) || libelleStatutParticipation(statut);

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5
                  py-0.5 text-xs font-medium ${apparence.classe}`}
    >
      <Icone size={13} aria-hidden="true" />
      {texte}
    </span>
  );
}

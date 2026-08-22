import Link from "next/link";
import { ShieldCheck, ShieldAlert, KeyRound, Lock } from "lucide-react";
import { listerAdministrateurs } from "@/lib/data/administrateurs";
import { estFondateur } from "@/lib/auth/garde";
import { VALIDITE_JETON_HEURES } from "@/lib/data/utilisateurs";
import { carteClass, legendClass, titrePageClass } from "@/lib/styles";
import RetourVers from "@/components/RetourVers";
import FormulaireAdministrateur from "./FormulaireAdministrateur";
import LigneAdministrateur from "./LigneAdministrateur";

/**
 * Gestion des administrateurs.
 *
 * ── L'écran est visible par tous les administrateurs, les ACTIONS non ────────
 *
 * Savoir qui détient les droits fait partie de ce qu'un administrateur doit
 * pouvoir vérifier — le lui cacher n'apporterait aucune sécurité, seulement de
 * l'opacité. En revanche, créer et rétrograder est réservé au fondateur.
 *
 * ⚠️ Ce que cette page cache n'est PAS ce qui protège. La doc le dit :
 * « Server Functions are reachable via direct POST requests. » Un non-fondateur
 * qui rejouerait la requête serait refusé par `exigerFondateurOuEchouer()` dans le
 * DAL. Le masquage sert à ne pas proposer une action vouée à l'échec, rien de plus.
 */

export const metadata = { title: "Administrateurs — EDC OM" };

export default async function AdministrateursPage() {
  // `listerAdministrateurs` porte `exigerAdministrateur` : un non-administrateur
  // est redirigé avant d'arriver ici.
  const [administrateurs, jeSuisFondateur] = await Promise.all([
    listerAdministrateurs(),
    estFondateur(),
  ]);

  return (
    <div className="flex min-h-full w-full flex-col gap-6 bg-blue-50 p-6 sm:p-10">
      <RetourVers href="/parametres" libelle="Retour aux paramètres" />

      <h1 className={titrePageClass}>Administrateurs</h1>

      <section className={`${carteClass} max-w-3xl`}>
        <h2 className={legendClass}>Ce que ce rôle permet</h2>
        <p className="text-sm text-blue-900/80">
          Un administrateur confirme les ordres de mission, gère le personnel, valide les
          congés et règle les paramètres. C&apos;est le rôle qui engage
          l&apos;entreprise : il se donne avec parcimonie.
        </p>
        <p className="flex items-start gap-2 rounded-lg bg-blue-100 p-3 text-sm text-blue-900">
          <Lock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            Seul le <strong>compte fondateur</strong> peut créer ou retirer des
            administrateurs. Cette restriction limite les dégâts d&apos;un compte
            compromis : sans elle, un seul accès détourné suffirait à en fabriquer
            autant qu&apos;on veut, et à exclure les titulaires légitimes.
          </span>
        </p>
      </section>

      {/* ── Liste ──────────────────────────────────────────────────────────── */}
      <section className={`${carteClass} max-w-3xl p-0`}>
        <h2 className={`${legendClass} px-6 pt-6`}>
          Comptes administrateurs ({administrateurs.length})
        </h2>

        <ul className="divide-y divide-blue-100">
          {administrateurs.map((admin) => (
            <LigneAdministrateur
              key={admin.id}
              admin={admin}
              peutAgir={jeSuisFondateur}
            />
          ))}
        </ul>
      </section>

      {/* ── Création ───────────────────────────────────────────────────────── */}
      {jeSuisFondateur ? (
        <FormulaireAdministrateur validiteHeures={VALIDITE_JETON_HEURES} />
      ) : (
        <section className={`${carteClass} max-w-3xl`}>
          <h2 className={legendClass}>Ajouter un administrateur</h2>
          <p className="flex items-start gap-2 text-sm text-blue-900/80">
            <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              Réservé au compte fondateur. Adressez-vous à son titulaire — ou, si ce
              compte n&apos;est plus accessible, à quelqu&apos;un ayant un accès au
              serveur : la commande{" "}
              <code className="rounded bg-blue-100 px-1 py-0.5 text-xs">
                npx tsx prisma/creerCompte.ts
              </code>{" "}
              permet de transférer la capacité.
            </span>
          </p>
        </section>
      )}

      <p className="max-w-3xl text-xs text-slate-600">
        <KeyRound size={12} aria-hidden="true" className="mr-1 inline" />
        Le mot de passe n&apos;est jamais choisi par celui qui crée le compte : le
        titulaire le définit lui-même via un lien à usage unique, valable{" "}
        {VALIDITE_JETON_HEURES} heures. Personne d&apos;autre que lui ne le connaît.
      </p>

      <p className="max-w-3xl text-xs text-slate-600">
        <ShieldCheck size={12} aria-hidden="true" className="mr-1 inline" />
        Pour créer un compte <em>utilisateur</em> ordinaire, passez par la fiche de
        l&apos;employé dans{" "}
        <Link href="/personnel" className="text-blue-700 underline">
          Personnel
        </Link>
        .
      </p>
    </div>
  );
}

import { redirect } from "next/navigation";
import Image from "next/image";
import { lireSession } from "@/lib/auth/garde";
import { cheminDeRetourSur } from "@/lib/auth/redirection";
import { titrePageClass } from "@/lib/styles";
import FormulaireConnexion from "./FormulaireConnexion";

/**
 * Page de connexion. Publique — c'est la seule, avec la définition du mot de
 * passe, que le proxy laisse passer sans session.
 *
 * `searchParams` est une promesse depuis Next 15 : la valeur ne peut pas être
 * lue de façon synchrone, ce qui rend la page dynamique par construction.
 */
export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string; motif?: string }>;
}) {
  const { retour, motif } = await searchParams;

  // Déjà connecté : la page de connexion n'a plus de sens. On renvoie là où
  // l'utilisateur voulait aller, ou à l'accueil.
  //
  // ⚠️ `lireSession()` et non `exigerSession()` : ici l'absence de session est
  // l'état normal, pas une erreur.
  const session = await lireSession();
  if (session) redirect(cheminDeRetourSur(retour));

  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-8 p-6 sm:p-10 bg-blue-50">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-24 h-24 rounded-xl overflow-hidden">
          <Image src="/logo.jpeg" alt="Logo EDC" fill sizes="96px" className="object-cover" />
        </div>
        <h1 className={titrePageClass}>Connexion</h1>
        <p className="text-blue-900/70 text-sm text-center">
          Gestion des Ordres de Mission — Electricity Development Corporation
        </p>
      </div>

      {/* Message contextuel quand la redirection vient d'une session expirée.
          Il est distinct de l'erreur d'identifiants : dire « session expirée »
          évite que l'utilisateur croie s'être trompé de mot de passe. */}
      {motif === "expiree" && (
        <p className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-2 text-sm text-amber-900 max-w-md">
          Votre session a expiré. Reconnectez-vous pour continuer.
        </p>
      )}

      <FormulaireConnexion retour={cheminDeRetourSur(retour)} />
    </div>
  );
}

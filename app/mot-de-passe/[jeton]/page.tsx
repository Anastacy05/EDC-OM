import type { Metadata } from "next";
import Link from "next/link";
import { verifierJetonMotDePasse } from "@/lib/data/utilisateurs";
import { carteClass, titrePageClass } from "@/lib/styles";
import FormulaireMotDePasse from "./FormulaireMotDePasse";

/**
 * Définition du mot de passe par lien reçu par courriel.
 *
 * ── Pourquoi le jeton est dans le chemin et non dans un paramètre ────────────
 *
 * Les deux fuient de la même façon (journaux du serveur, historique du
 * navigateur). Le chemin a un avantage pratique : il survit à une copie
 * partielle du lien dans un client de messagerie qui tronque les paramètres.
 * Et il est de toute façon à usage unique et valable 48 heures.
 *
 * ── Ce que les métadonnées ci-dessous empêchent ──────────────────────────────
 *
 * `referrer: "no-referrer"` : sans cette ligne, cliquer un lien sortant depuis
 * cette page enverrait l'URL COMPLÈTE — donc le jeton — au site de destination
 * dans l'en-tête `Referer`. C'est une fuite réelle et discrète.
 *
 * `robots` : au cas où l'application serait un jour exposée, un lien
 * d'invitation ne doit jamais se retrouver dans un index.
 */
export const metadata: Metadata = {
  title: "Définir son mot de passe",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function MotDePassePage({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;

  // Vérification SANS consommation : l'utilisateur doit pouvoir revenir sur la
  // page (rechargement, correction de saisie) sans brûler son lien. Le jeton
  // n'est consommé qu'à l'écriture du mot de passe, dans la même transaction.
  const valide = await verifierJetonMotDePasse(decodeURIComponent(jeton));

  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-8 p-6 sm:p-10 bg-blue-50">
      <h1 className={titrePageClass}>
        {valide?.aDejaUnMotDePasse ? "Nouveau mot de passe" : "Définir votre mot de passe"}
      </h1>

      {valide ? (
        <FormulaireMotDePasse
          jeton={decodeURIComponent(jeton)}
          email={valide.email}
          reinitialisation={valide.aDejaUnMotDePasse}
        />
      ) : (
        /* Un seul message pour tous les échecs — jeton inconnu, expiré, déjà
           utilisé, compte désactivé. Les distinguer renseignerait un tiers sur
           l'existence d'un compte et sur l'état d'une invitation. */
        <div className={`${carteClass} w-full max-w-md`}>
          <p className="text-blue-900">
            Ce lien n&apos;est plus valable. Il a peut-être déjà servi, ou dépassé son délai de
            validité de 48 heures.
          </p>
          <p className="text-sm text-blue-900/70">
            Demandez à l&apos;administrateur de vous en envoyer un nouveau.
          </p>
          <Link
            href="/connexion"
            className="self-start py-2 px-4 rounded-lg bg-white/90 text-blue-800 shadow-md
                       shadow-blue-950/20 hover:bg-white transition-all duration-300"
          >
            Aller à la connexion
          </Link>
        </div>
      )}
    </div>
  );
}

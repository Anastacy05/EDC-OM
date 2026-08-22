import Image from "next/image";
import Link from "next/link";
import { FilePlus2, List } from "lucide-react";
import { boutonPrimaire, boutonSecondaire, TAILLE_ICONE } from "@/lib/styles";

/**
 * Accueil.
 *
 * ── Composant SERVEUR depuis le 21/08/2026 ───────────────────────────────────
 *
 * Il était client uniquement pour appeler `router.push()` depuis le `onClick` de
 * deux `<div>`. C'était doublement coûteux : `useRouter` obligeait toute la page
 * à partir au navigateur, et surtout un `<div onClick>` n'est PAS un lien — il
 * n'est ni atteignable au clavier, ni annoncé comme lien, ni ouvrable dans un
 * nouvel onglet, et il n'affiche pas sa cible dans la barre d'état. Deux `<Link>`
 * font le même travail, mieux, sans une ligne de JavaScript.
 *
 * ── Hiérarchie des actions ───────────────────────────────────────────────────
 *
 * Les deux boutons se valaient visuellement : même taille, même forme, deux
 * bleus différents. Rien ne disait lequel est l'action attendue. « Créer » devient
 * l'action principale (plein), « Consulter » la secondaire (contour) — c'est la
 * raison d'être de l'application, et lire une liste est toujours moins engageant
 * qu'une création.
 */
export default function Accueil() {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-12 bg-blue-50 p-6 sm:p-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative h-32 w-32 overflow-hidden rounded-2xl shadow-lg shadow-blue-950/10">
          {/* alt="" : purement décoratif — le titre juste en dessous porte
              l'identité. Un alt « Logo » serait annoncé en doublon. */}
          <Image
            src="/logo.jpeg"
            alt=""
            fill
            sizes="128px"
            className="object-cover"
            // priority : c'est la plus grande image de la première page vue,
            // donc l'élément qui décide du LCP. Sans lui, Next la charge en
            // différé et le repère se déplace d'autant.
            priority
          />
        </div>

        <h1 className="text-4xl font-bold italic text-amber-700 drop-shadow-lg sm:text-5xl">
          OM for EDC
        </h1>
        <p className="max-w-md text-blue-900/80">
          Votre application de gestion des Ordres de Mission
        </p>
      </div>

      {/* `items-stretch` en colonne : sur téléphone les deux boutons prennent la
          même largeur, ce qui évite l'escalier disgracieux de deux libellés de
          longueurs différentes. */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Link href="/om/nouveau" className={boutonPrimaire}>
          <FilePlus2 size={TAILLE_ICONE} aria-hidden="true" />
          Créer un ordre de mission
        </Link>
        <Link href="/om" className={boutonSecondaire}>
          <List size={TAILLE_ICONE} aria-hidden="true" />
          Consulter les ordres de mission
        </Link>
      </div>
    </div>
  );
}

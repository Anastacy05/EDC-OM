"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useBrouillonNonEnregistre } from "@/contexts/brouillonContext";

export default function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { actif, desactiver } = useBrouillonNonEnregistre();

  const parent = pathname.replace(/\/[^/]*$/, "") || "/";
  if (pathname === "/") return null;

  // Sans brouillon en cours, <Link> navigue normalement — l'essentiel est
  // ici : si la page courante a signalé un brouillon (ex. des participants
  // déjà ajoutés sur /om/nouveau, pas encore enregistrés), on intercepte le
  // clic pour ne pas les perdre en silence.
  const gererClic = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!actif) return;
    e.preventDefault();
    if (confirm("Des modifications n'ont pas été enregistrées. Quitter quand même ?")) {
      desactiver();
      router.push(parent);
    }
  };

  return (
    <Link
      href={parent}
      onClick={gererClic}
      aria-label="Revenir à la page précédente"
      className="py-2 px-4 rounded-lg bg-white/90 text-blue-800 shadow-md shadow-blue-950/20
                 hover:bg-white hover:scale-105 transition-all duration-300"
    >
      ← Retour
    </Link>
  );
}


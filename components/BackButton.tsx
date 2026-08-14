"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BackButton() {
  const pathname = usePathname();

  const parent = pathname.replace(/\/[^/]*$/, "") || "/";
  if (pathname === "/") return null;

  return (
    <Link
      href={parent}
      aria-label="Revenir à la page précédente"
      className="py-2 px-4 rounded-lg bg-white/90 text-blue-800 shadow-md shadow-blue-950/20
                 hover:bg-white hover:scale-105 transition-all duration-300"
    >
      ← Retour
    </Link>
  );
}

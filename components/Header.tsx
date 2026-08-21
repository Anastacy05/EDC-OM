import Image from "next/image";
import { Suspense } from "react";
import BackButton from "@/components/BackButton";
import ZoneSession, { SqueletteZoneSession } from "@/components/ZoneSession";

export default function Header() {
  return (
    <div className="w-full h-auto min-h-[60px] bg-blue-500 flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 md:px-8 py-3 sm:py-0 border-b-2 border-blue-600 gap-3 sm:gap-0">
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0">
          <Image
            src="/logo.jpeg"
            alt="Logo"
            fill
            sizes="(max-width: 640px) 48px, 48px"
            className="object-cover"
          />
        </div>
        <BackButton />
      </div>

      <div className="flex items-center justify-center gap-2 sm:gap-4 md:gap-6 lg:gap-10 flex-wrap transition-all duration-500">
        {/* Suspense : lire la session est dynamique (cookies + base). Sans cette
            frontière, l'attente remonterait au layout racine et retarderait le
            premier octet de TOUTES les pages — la doc appelle à « push dynamic
            access down ». Le Header lui-même reste statique. */}
        <Suspense fallback={<SqueletteZoneSession />}>
          <ZoneSession />
        </Suspense>

        {/* COMMENTÉ (21/08/2026) — remplacés par ZoneSession, qui affiche
            réellement l'état de connexion.

            « S'inscrire » ne reviendra pas : il n'y a pas d'inscription libre
            dans cette application. Les comptes sont créés par l'administrateur
            avec le matricule de l'employé, et le titulaire définit son mot de
            passe par le lien reçu par courriel. Laisser une inscription ouverte
            permettrait de créer un compte sans matricule, donc sans employé —
            et de contourner l'appariement compte/employé sur lequel reposent
            les quotas de mission et les soldes de congés.

        <div
          title="Pas encore disponible"
          className="py-2 px-4 rounded-lg bg-blue-300/50 text-white/70 shadow-md cursor-not-allowed shadow-blue-950/20"
        >
          S&apos;inscrire
        </div>
        <div
          title="Pas encore disponible"
          className="py-2 px-4 rounded-lg bg-white/50 text-blue-900/50 shadow-md cursor-not-allowed shadow-blue-950/20"
        >
          Se Connecter
        </div>
        */}

        {/* Toujours pas fonctionnels — désactivés visuellement plutôt que
            cachés, pour ne pas donner l'impression que ces fonctionnalités
            existent déjà. */}
        <div
          title="Pas encore disponible"
          className="p-2 rounded-lg bg-amber-200/50 text-blue-800/50 shadow-md cursor-not-allowed shadow-amber-800/20"
        >
          FR
        </div>
        <div
          title="Pas encore disponible"
          className="p-2 rounded-lg bg-amber-500/50 text-blue-400/50 shadow-md cursor-not-allowed shadow-amber-50/20"
        >
          Moon
        </div>
      </div>
    </div>
  );
}

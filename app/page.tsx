"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="h-full w-full flex flex-col justify-center items-center gap-20 p-10 bg-blue-50">
      <div className="flex flex-col justify-center items-center gap-5">
        <div className="text-5xl font-bold italic text-amber-700 drop-shadow-xl">
          OM for EDC
        </div>
        <div className="text-amber-700 text-md font-medium">
          Votre Application de gestion des Ordres de Missions
        </div>
        <div className="relative w-50 h-50 rounded-xl overflow-hidden">
          <Image
            src="/logo.jpeg"
            alt="Logo"
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        </div>
      </div>

      <div className="flex justify-center items-center gap-10">
        <div
          className="p-5 rounded-full bg-blue-300 hover:bg-blue-200 hover:scale-110 cursor-pointer shadow-xl shadow-blue-950/20 transition-all duration-300"
          onClick={() => {
            router.push("/om");
          }}
        >
          Consulter les OM
        </div>
        <div
          className="p-5 rounded-full bg-blue-700 hover:bg-blue-800 text-white hover:scale-110 cursor-pointer shadow-xl shadow-blue-950/20 transition-all duration-300"
          onClick={() => {
            router.push("/om/nouveau");
          }}
        >
          Créer un OM
        </div>
      </div>
    </div>
  );
}

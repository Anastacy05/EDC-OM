"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import OMPreview from "@/components/OMPreview";
import { getMockOM, confirmMockOM, deleteMockOM } from "@/lib/mockData";
import { formatDateFR } from "@/lib/dateUtils";

export default function OMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const om = getMockOM(id);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!om) {
    return (
      <div className="min-h-full w-full bg-blue-50 flex items-center justify-center">
        <p className="text-amber-700 text-lg">Ordre de mission introuvable.</p>
      </div>
    );
  }

  const handleConfirm = () => {
    setConfirming(true);
    confirmMockOM(om.id);
    // Rafraîchit la page pour refléter le nouveau statut (mockOMs est en
    // mémoire, pas de revalidation automatique côté client sans ça).
    router.refresh();
    setConfirming(false);
  };

  const handleDelete = () => {
    if (!confirm("Supprimer définitivement cet ordre de mission ?")) return;
    deleteMockOM(om.id);
    router.push("/om");
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/generate-om", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // On envoie l'objet OM tel qu'on l'a déjà en mémoire (mock aujourd'hui,
        // réponse Spring Boot demain) — la route n'a besoin de rien d'autre.
        // Les dates sont stockées en ISO (pour le filtrage) donc on les
        // reformate en JJ/MM/AAAA juste avant l'écriture dans le Word.
        body: JSON.stringify({
          ...om,
          dateDepart: formatDateFR(om.dateDepart),
          dateRetour: formatDateFR(om.dateRetour),
          dateEmission: formatDateFR(om.dateEmission),
        }),
      });
      if (!res.ok) throw new Error("Échec du téléchargement");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ordre_mission_${om.matricule}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-full w-full bg-blue-50 py-10">
      {/* Le fac-similé (OMPreview) reste volontairement neutre / fidèle au
          document Word imprimé — pas de branding bleu/ambre dessus, et
          purement en lecture : un OM créé n'est plus modifiable. */}
      <OMPreview om={om} />

      <div className="max-w-[794px] mx-auto px-4 flex justify-center gap-4 flex-wrap">
        <button
          onClick={handleConfirm}
          disabled={om.statut === "CONFIRME" || confirming}
          className="py-3 px-8 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-green-200
                     disabled:cursor-not-allowed text-white shadow-xl shadow-blue-950/20
                     hover:scale-105 transition-all duration-300"
        >
          {om.statut === "CONFIRME" ? "Déjà confirmé" : confirming ? "Confirmation…" : "Confirmer"}
        </button>

        <button
          onClick={handleDelete}
          className="py-3 px-8 rounded-full bg-red-600 hover:bg-red-700 text-white
                     shadow-xl shadow-blue-950/20 hover:scale-105 transition-all duration-300"
        >
          Supprimer
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="py-3 px-8 rounded-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300
                     disabled:cursor-not-allowed text-white shadow-xl shadow-blue-950/20
                     hover:scale-105 transition-all duration-300"
        >
          {downloading ? "Génération…" : "Télécharger (Word)"}
        </button>
      </div>
    </div>
  );
}

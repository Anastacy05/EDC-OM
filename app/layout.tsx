import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { BrouillonProvider } from "@/contexts/brouillonContext";

export const metadata: Metadata = {
  title: "EDC OM",
  description: "Application de gestion des Ordres de Mission pour l'EDC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="bg-blue-50">
        {/* min-h-dvh (et non h-screen) : sur mobile, dvh suit la barre
            d'adresse qui se rétracte, et `min-` laisse la page grandir au
            lieu de piéger le contenu dans un conteneur à scroll interne.
            w-screen est volontairement absent : il vaut 100vw, barre de
            défilement comprise, ce qui provoque un débordement horizontal. */}
        {/* BrouillonProvider englobe Header ET main : c'est ce qui permet à
            BackButton (dans Header) de savoir qu'une page enfant (ex.
            /om/nouveau) a un brouillon non enregistré en cours. */}
        <BrouillonProvider>
          <div className="min-h-dvh flex flex-col">
            <Header />
            <main className="flex-1">{children}</main>
          </div>
        </BrouillonProvider>
      </body>
    </html>
  );
}


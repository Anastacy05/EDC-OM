import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { BrouillonProvider } from "@/contexts/brouillonContext";

// Inter, chargée via next/font — qui « includes built-in self-hosting for any
// font file » : les fichiers sont servis par notre propre domaine, jamais par
// un CDN Google. C'est indispensable ici, l'application devant fonctionner
// hors ligne : une police distante ne se chargerait pas et le texte
// retomberait sur une police système, en décalant toute la mise en page.
//
// Police variable (pas de `weight` figé) : un seul fichier couvre toutes les
// graisses, ce que la doc recommande « for the best performance and flexibility ».
//
// `variable` plutôt que `className` : ça déclare --font-inter, qu'on branche
// ensuite sur --font-sans dans globals.css. Tailwind v4 lit cette variable,
// donc `font-sans` et l'héritage par défaut passent tous les deux par Inter.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  // Pendant le chargement, on affiche la police système plutôt qu'un blanc :
  // sur une connexion lente, le texte reste lisible tout de suite.
  display: "swap",
});

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
    <html lang="fr" className={inter.variable}>
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


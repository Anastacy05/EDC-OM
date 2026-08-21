import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Anciennes adresses de la section d'administration.
   *
   * Le 21/08/2026, `/admin` a été éclatée en deux onglets de nature
   * différente : `/parametres` (des réglages qui S'ÉCRIVENT) et `/rapports`
   * (des données qui se LISENT). Elles étaient mélangées sur une seule page.
   *
   * Ces redirections existent pour les signets déjà posés et les liens déjà
   * partagés. `permanent: true` → **308**, et non 301 : la doc explique
   * pourquoi Next les préfère — « many browsers changed the request method of
   * the redirect to GET, regardless of the original method », alors que 307 et
   * 308 préservent la méthode.
   *
   * ⚠️ Elles sont évaluées AVANT le système de fichiers (« Redirects are
   * checked before the filesystem »), donc avant les layouts de section. L'ordre
   * ne crée aucun trou : c'est la destination qui porte la garde, pas l'ancienne
   * adresse.
   *
   * À retirer quand on jugera les anciens liens éteints.
   */
  redirects() {
    return [
      { source: "/admin", destination: "/parametres", permanent: true },
      { source: "/admin/carte", destination: "/rapports/carte", permanent: true },
      { source: "/admin/frise", destination: "/rapports/frise", permanent: true },
      { source: "/admin/pyramide", destination: "/rapports/pyramide", permanent: true },
      // Toute autre sous-route de /admin retombe sur l'index des rapports
      // plutôt que sur un 404, cette section n'ayant jamais contenu autre chose.
      { source: "/admin/:chemin*", destination: "/rapports", permanent: true },
    ];
  },
};

export default nextConfig;

import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

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
    <html lang="en">
      <body className="bg-blue-50">
        <div className="h-screen w-screen flex flex-col">
          <Header />
          <main className="flex-1 min-h-0 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}

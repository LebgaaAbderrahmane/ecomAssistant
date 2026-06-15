import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "EcomAssistant — Agent WhatsApp IA pour le e-commerce algérien",
  description:
    "EcomAssistant contacte vos clients sur WhatsApp, confirme les commandes COD, relance les silencieux — en darija, français et arabe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

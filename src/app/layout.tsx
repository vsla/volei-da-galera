import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// Sem isso o WhatsApp não resolve a imagem do card (a URL sai relativa).
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Vôlei Prainha ZN",
  description: "Quem chegou, joga. Quem jogou menos, joga antes.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0f0d",
  width: "device-width",
  initialScale: 1,
  // trava o zoom por toque duplo: a tela é operada com uma mão em pé
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${barlow.variable} ${inter.variable}`}>
      {/* extensões de navegador injetam atributos no body antes da hidratação */}
      <body className="font-body bg-bg text-ink" suppressHydrationWarning>
        {/*
          h-dvh + overflow-hidden: a casca tem a altura exata da viewport e
          NÃO rola. Quem rola é só o <main>. Com min-h-dvh havia dois
          scrolls empilhados — o do documento e o do main — e no Safari do
          iPhone, quando a barra de endereço recolhe, o documento ganhava
          uns pixels a mais e sobrava aquele arrasto morto no fim da página.
        */}
        <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}

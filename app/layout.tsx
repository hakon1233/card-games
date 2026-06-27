import type { Metadata, Viewport } from "next";
import { Lora, Playfair_Display } from "next/font/google";
import { AnimationPreferencesProvider } from "@/components/game/animation-preferences-control";
import { CardDeckProvider } from "@/components/game/card-deck-control";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-pip-display",
  subsets: ["latin"],
  weight: ["700"],
});

const lora = Lora({
  variable: "--font-pip-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Pip Playing & Card Co.",
  description: "Classic card games online: Blackjack, Crazy Eights, Go Fish, and Yaniv.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#7A1F1B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnimationPreferencesProvider />
        <CardDeckProvider />
        {children}
      </body>
    </html>
  );
}

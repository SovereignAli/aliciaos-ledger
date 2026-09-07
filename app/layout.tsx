import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import { cspNonce } from "@/lib/request";
import "./globals.css";

/*
 * Alicia's type: Instrument Serif for the big numbers and headings, Instrument
 * Sans for everything meant to be read. Both are fetched at build time by
 * next/font and self-hosted from the deployment, so nothing loads from Google
 * at runtime. Instrument Serif ships one weight; see .font-display in
 * globals.css, which keeps browsers from faking a bold.
 */
const serif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});
const sans = Instrument_Sans({
  variable: "--font-instrument-sans",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ECE4F5" }, { media: "(prefers-color-scheme: dark)", color: "#12081C" }] };

export const metadata: Metadata = {
  title: { default: "AliciaOS Ledger", template: "%s · AliciaOS Ledger" },
  description: "Personal financial operations.",
  robots: { index: false, follow: false },
};

const THEME_BOOT = `try{var t=localStorage.getItem("aliciaos-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = await cspNonce();
  return (
    <ClerkProvider dynamic>
      <html lang="en" className={`${serif.variable} ${sans.variable} h-full`} suppressHydrationWarning>
        <head>
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        </head>
        <body className="min-h-full flex flex-col bg-desktop text-ink">{children}</body>
      </html>
    </ClerkProvider>
  );
}

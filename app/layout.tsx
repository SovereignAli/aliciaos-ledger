import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import localFont from "next/font/local";
import { cspNonce } from "@/lib/request";
import "./globals.css";

/* The site's typeface, self-hosted from the same files alexwil.com ships. */
const zalando = localFont({
  variable: "--font-zalando",
  src: [
    { path: "../public/fonts/ZalandoSans.woff2", weight: "100 900", style: "normal" },
    { path: "../public/fonts/ZalandoSans-Italic.woff2", weight: "100 900", style: "italic" },
  ],
  display: "swap",
});
const zalandoExpanded = localFont({
  variable: "--font-zalando-expanded",
  src: [{ path: "../public/fonts/ZalandoSans-Expanded.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
});
const zalandoSemi = localFont({
  variable: "--font-zalando-semi",
  src: [{ path: "../public/fonts/ZalandoSans-SemiExpanded.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
});

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#E8E0D4" }, { media: "(prefers-color-scheme: dark)", color: "#0B0C0A" }] };

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
      <html lang="en" className={`${zalando.variable} ${zalandoExpanded.variable} ${zalandoSemi.variable} h-full`} suppressHydrationWarning>
        <head>
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        </head>
        <body className="min-h-full flex flex-col bg-desktop text-ink">{children}</body>
      </html>
    </ClerkProvider>
  );
}

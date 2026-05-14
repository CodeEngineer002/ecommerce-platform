import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic, Noto_Sans_Devanagari } from "next/font/google";
import { headers } from "next/headers";

import { APP_NAME } from "@/lib/constants";

import { Providers } from "./providers";

import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const notoArabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });
const notoDevanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-hindi", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: `${APP_NAME} — Shop the best products at unbeatable prices.`,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000"),
  openGraph: { type: "website", siteName: APP_NAME },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const lang = headersList.get("x-language") ?? "en";
  const dir = (headersList.get("x-text-direction") ?? "ltr") as "ltr" | "rtl";

  const fontVars = `${inter.variable} ${notoArabic.variable} ${notoDevanagari.variable}`;

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning className={fontVars}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, Outfit, Poppins, Lato, Raleway, Nunito } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

/*
 * The other four storefront faces.
 *
 * StorefrontConfig has offered six fonts since it was written, but only
 * Inter and Outfit were ever loaded — a merchant who picked Poppins got
 * `font-family: Poppins, sans-serif` against a document that had never
 * heard of Poppins, so their shop silently rendered in the system sans.
 * All six are declared here so the choice means something.
 *
 * preload: false because these are opt-in: Koraa's own chrome uses Inter
 * and Outfit, and a route that never names Raleway should not spend a
 * request on it. Dropping the preload link leaves the @font-face rule in
 * place, so the file is fetched the moment a storefront or a Blueprint
 * type specimen actually asks for it.
 *
 * Poppins and Lato are not variable fonts, so their weights have to be
 * enumerated. Lato has no 500/600/800 — the storefront asks for those and
 * the browser picks the nearest of what is listed.
 *
 * Every option is written out per call. next/font resolves these at build
 * time by statically reading the call site, so it rejects a spread or a
 * shared options object outright ("Unexpected spread") — the repetition is
 * required, not an oversight.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  preload: false,
  variable: "--font-poppins",
});
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
  preload: false,
  variable: "--font-lato",
});
const raleway = Raleway({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-raleway",
});
const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-nunito",
});

const FONT_VARS = [inter, outfit, poppins, lato, raleway, nunito]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  metadataBase: new URL("https://koraa.cm"),
  title: "Koraa | Sell Online in Africa",
  description:
    "The premium e-commerce platform built for Cameroonian businesses to sell anywhere.",
  keywords: [
    "ecommerce",
    "cameroon",
    "online store",
    "sell online",
    "koraa",
    "storefront",
    "koraa Cameroon",
    "buyam",
    "digital store",
    "buea",
  ],
  openGraph: {
    title: "Koraa | Sell Online in Africa",
    description:
      "The premium e-commerce platform built for Cameroonian businesses to sell anywhere.",
    url: "https://koraa.cm",
    siteName: "Koraa",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://i.postimg.cc/wTqpNNVq/koraa-logo-white.png",
        width: 1200,
        height: 630,
        alt: "Koraa — Sell Online in Africa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Koraa | Sell Online in Africa",
    description:
      "Koraa is a Cameroonian e-commerce platform that helps businesses create, customize, and manage professional online stores. Sell products online, accept local payments, and reach more customers.",
    creator: "@reconraven0x",
    images: ["https://i.postimg.cc/TYd6bb93/koraa-logo-round.png"],
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${FONT_VARS} antialiased`}
        style={{
          background: "var(--surface-950)",
          color: "var(--text-primary)",
          margin: 0,
          padding: 0,
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

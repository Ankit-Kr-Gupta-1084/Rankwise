import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jeerankpredictor.duodevs.xyz"),
  title: {
    default:
      "JEE Main Rank Predictor 2027 | Marks vs Percentile & Rank Calculator - RankWise",
    template: "%s | RankWise",
  },
  description:
    "Predict your JEE Main 2027 All India Rank and percentile from your expected or actual marks. Explore historical shift difficulty and marks vs percentile trends.",
  alternates: {
    canonical: "https://jeerankpredictor.duodevs.xyz",
  },
  openGraph: {
    title:
      "JEE Main Rank Predictor 2027 | Marks vs Percentile & Rank Calculator - RankWise",
    description:
      "Predict your JEE Main 2027 All India Rank and percentile from your expected or actual marks. Explore historical shift difficulty and marks vs percentile trends.",
    url: "https://jeerankpredictor.duodevs.xyz",
    siteName: "RankWise",
    images: [
      {
        url: "/duodevs-full.png",
        width: 760,
        height: 460,
        alt: "RankWise - JEE Main Rank Predictor",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "JEE Main Rank Predictor 2027 | Marks vs Percentile & Rank Calculator - RankWise",
    description:
      "Predict your JEE Main 2027 All India Rank and percentile from your expected or actual marks. Explore historical shift difficulty and marks vs percentile trends.",
    images: ["/duodevs-full.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

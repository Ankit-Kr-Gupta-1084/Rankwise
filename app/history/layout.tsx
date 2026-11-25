import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JEE Main Marks vs Percentile (2024–2026)",
  description:
    "Explore historical JEE Main marks vs percentile trends across shifts, sessions and difficulty levels from 2024 to 2026.",
  alternates: {
    canonical: "https://jeerankpredictor.duodevs.xyz/history",
  },
  openGraph: {
    title: "JEE Main Marks vs Percentile (2024–2026) | RankWise",
    description:
      "Explore historical JEE Main marks vs percentile trends across shifts, sessions and difficulty levels from 2024 to 2026.",
    url: "https://jeerankpredictor.duodevs.xyz/history",
    siteName: "RankWise",
    images: [
      {
        url: "/duodevs-full.png",
        width: 760,
        height: 460,
        alt: "RankWise - Historical Marks vs Percentile Trends",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "JEE Main Marks vs Percentile (2024–2026) | RankWise",
    description:
      "Explore historical JEE Main marks vs percentile trends across shifts, sessions and difficulty levels from 2024 to 2026.",
    images: ["/duodevs-full.png"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://jeerankpredictor.duodevs.xyz/",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "History",
      item: "https://jeerankpredictor.duodevs.xyz/history",
    },
  ],
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  );
}

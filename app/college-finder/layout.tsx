import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "JEE Main College Predictor 2027 | JoSAA College Finder - RankWise",
  },
  description:
    "Explore NITs, IIITs and GFTIs using your JEE Main rank, category, seat pool and home state quota with JoSAA opening and closing rank data.",
  alternates: {
    canonical: "https://jeerankpredictor.duodevs.xyz/college-finder",
  },
  openGraph: {
    title: "JEE Main College Predictor 2027 | JoSAA College Finder - RankWise",
    description:
      "Explore NITs, IIITs and GFTIs using your JEE Main rank, category, seat pool and home state quota with JoSAA opening and closing rank data.",
    url: "https://jeerankpredictor.duodevs.xyz/college-finder",
    siteName: "RankWise",
    images: [
      {
        url: "/duodevs-full.png",
        width: 760,
        height: 460,
        alt: "RankWise - JEE Main College Predictor",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "JEE Main College Predictor 2027 | JoSAA College Finder - RankWise",
    description:
      "Explore NITs, IIITs and GFTIs using your JEE Main rank, category, seat pool and home state quota with JoSAA opening and closing rank data.",
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
      name: "College Finder",
      item: "https://jeerankpredictor.duodevs.xyz/college-finder",
    },
  ],
};

export default function CollegeFinderLayout({
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

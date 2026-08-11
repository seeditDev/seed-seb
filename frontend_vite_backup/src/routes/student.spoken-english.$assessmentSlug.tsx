import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/spoken-english/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Spoken English assessment — SEED-SEB" },
      { name: "description", content: "Record and submit your spoken-English assessment inside the SEED-SEB secure exam portal." },
      { property: "og:title", content: "Spoken English assessment — SEED-SEB" },
      { property: "og:description", content: "Record and submit your spoken-English assessment inside the SEED-SEB secure exam portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/SpokenEnglishAssessment")),
});

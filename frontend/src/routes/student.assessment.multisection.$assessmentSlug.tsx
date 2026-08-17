import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/assessment/multisection/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Multi-section assessment — SEED-SEB" },
      {
        name: "description",
        content:
          "Attempt a multi-section proctored assessment combining aptitude, MCQ and coding rounds.",
      },
      { property: "og:title", content: "Multi-section assessment — SEED-SEB" },
      {
        property: "og:description",
        content:
          "Attempt a multi-section proctored assessment combining aptitude, MCQ and coding rounds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/MultiSectionAssessment")),
});

import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/assessment/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Assessment — SEED-SEB" },
      {
        name: "description",
        content:
          "Attempt a proctored assessment.",
      },
      { property: "og:title", content: "Assessment — SEED-SEB" },
      {
        property: "og:description",
        content:
          "Attempt a proctored assessment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/MultiSectionAssessment")),
});

import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/coding/")({
  head: () => ({
    meta: [
      { title: "Coding assessments — SEED-SEB" },
      {
        name: "description",
        content:
          "Browse and launch proctored coding assessments in the SEED-SEB secure exam portal.",
      },
      { property: "og:title", content: "Coding assessments — SEED-SEB" },
      {
        property: "og:description",
        content:
          "Browse and launch proctored coding assessments in the SEED-SEB secure exam portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/CodingAssessmentPage")),
});

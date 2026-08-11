import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/coding/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Coding assessment — SEED-SEB" },
      { name: "description", content: "Solve and submit coding problems in a proctored SEED-SEB assessment session." },
      { property: "og:title", content: "Coding assessment — SEED-SEB" },
      { property: "og:description", content: "Solve and submit coding problems in a proctored SEED-SEB assessment session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/CodingAssessmentPage")),
});

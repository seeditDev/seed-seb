import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/mcq/")({
  head: () => ({
    meta: [
      { title: "MCQ assessments — SEED-SEB" },
      {
        name: "description",
        content:
          "Timed multiple-choice assessments with proctoring inside the SEED-SEB secure exam portal.",
      },
      { property: "og:title", content: "MCQ assessments — SEED-SEB" },
      {
        property: "og:description",
        content:
          "Timed multiple-choice assessments with proctoring inside the SEED-SEB secure exam portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/MCQPage")),
});

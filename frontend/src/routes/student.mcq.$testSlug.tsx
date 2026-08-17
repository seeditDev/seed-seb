import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/mcq/$testSlug")({
  head: () => ({
    meta: [
      { title: "MCQ test — SEED-SEB" },
      {
        name: "description",
        content:
          "Attempt your timed, proctored multiple-choice test in the SEED-SEB secure exam portal.",
      },
      { property: "og:title", content: "MCQ test — SEED-SEB" },
      {
        property: "og:description",
        content:
          "Attempt your timed, proctored multiple-choice test in the SEED-SEB secure exam portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/MCQPage")),
});

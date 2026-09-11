import { createFileRoute } from "@tanstack/react-router";
import { createRouteAdapter } from '@/components/routeAdapter';

/**
 * Assessment Feedback Route.
 * 
 * Provides an accessible route for post-assessment feedback
 * before returning to the student dashboard.
 * URL: /student/assessment/feedback
 */
export const Route = createFileRoute("/student/assessment/feedback")({
  head: () => ({
    meta: [
      { title: "Assessment Feedback — SEED-SEB" },
      {
        name: "description",
        content: "Provide feedback on your assessment and platform experience in SEED-SEB.",
      },
      { property: "og:title", content: "Assessment Feedback — SEED-SEB" },
      {
        property: "og:description",
        content: "Provide feedback on your assessment and platform experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createRouteAdapter(
    () => import("@/components/AssessmentFeedback")
  ),
});

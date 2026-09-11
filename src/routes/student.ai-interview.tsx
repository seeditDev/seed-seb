import { createFileRoute } from "@tanstack/react-router";
import { createRouteAdapter } from '@/components/routeAdapter';

/**
 * Dedicated Full-Screen AI Placement Interview Studio Route.
 *
 * URL: /student/ai-interview
 */
export const Route = createFileRoute("/student/ai-interview")({
  head: () => ({
    meta: [
      { title: "AI Interview Simulator — SEED-SEB" },
      {
        name: "description",
        content: "Interactive AI Voice, Video & Technical Placement Interview Simulator with real-time feedback.",
      },
      { property: "og:title", content: "AI Interview Simulator — SEED-SEB" },
      {
        property: "og:description",
        content: "Interactive AI Voice, Video & Technical Placement Interview Simulator with real-time feedback.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createRouteAdapter(() => import("@/components/AIInterviewPage")),
});

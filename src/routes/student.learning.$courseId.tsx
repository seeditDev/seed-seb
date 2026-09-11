import { createFileRoute } from "@tanstack/react-router";
import { createRouteAdapter } from '@/components/routeAdapter';

/**
 * Dedicated Full-Screen Course Learning Classroom Route.
 *
 * URL: /student/learning/:courseId
 * Query: ?view=CLASS | OVERVIEW
 */
export const Route = createFileRoute("/student/learning/$courseId")({
  head: () => ({
    meta: [
      { title: "Course Learning Classroom — SEED-SEB" },
      {
        name: "description",
        content: "Interactive course learning classroom with video player, lesson notes, and coding sandbox.",
      },
      { property: "og:title", content: "Course Learning Classroom — SEED-SEB" },
      {
        property: "og:description",
        content: "Interactive course learning classroom with video player, lesson notes, and coding sandbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createRouteAdapter(() => import("@/components/CourseLearningPage")),
});

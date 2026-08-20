import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy SEA route — redirects to the unified Assessment runtime.
 */
export const Route = createFileRoute("/student/sea/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Assessment — SEED-SEB" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/student/assessment/multisection/$assessmentSlug",
      params: { assessmentSlug: params.assessmentSlug },
      replace: true,
    });
  },
  component: () => null,
});

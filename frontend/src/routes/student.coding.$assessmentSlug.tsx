import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy Coding route — redirects seamlessly to the unified Assessment runtime.
 */
export const Route = createFileRoute("/student/coding/$assessmentSlug")({
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

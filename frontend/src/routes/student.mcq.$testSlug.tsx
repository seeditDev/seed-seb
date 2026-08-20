import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy MCQ route — redirects seamlessly to the unified Assessment runtime.
 * The assessment data is already in sessionStorage from the dashboard launch,
 * so MultiSectionAssessment picks it up at the new URL without re-fetching.
 */
export const Route = createFileRoute("/student/mcq/$testSlug")({
  head: () => ({
    meta: [
      { title: "Assessment — SEED-SEB" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/student/assessment/multisection/$assessmentSlug",
      params: { assessmentSlug: params.testSlug },
      replace: true,
    });
  },
  component: () => null,
});

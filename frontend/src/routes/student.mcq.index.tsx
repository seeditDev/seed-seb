import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy MCQ index — redirect to student dashboard. */
export const Route = createFileRoute("/student/mcq/")({
  beforeLoad: () => {
    throw redirect({ to: "/student/dashboard", replace: true });
  },
  component: () => null,
});

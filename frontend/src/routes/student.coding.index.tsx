import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy Coding index — redirect to student dashboard. */
export const Route = createFileRoute("/student/coding/")({
  beforeLoad: () => {
    throw redirect({ to: "/student/dashboard", replace: true });
  },
  component: () => null,
});

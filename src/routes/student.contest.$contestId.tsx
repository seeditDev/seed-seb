import { createFileRoute } from "@tanstack/react-router";
import { createRouteAdapter } from '@/components/routeAdapter';

export const Route = createFileRoute("/student/contest/$contestId")({
  head: () => ({
    meta: [
      { title: "Contest Arena — SEED-SEB" },
      {
        name: "description",
        content: "Live proctored competitive contest arena in SEED-SEB.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createRouteAdapter(
    () => import("@/components/contests/ContestPage")
  ),
});

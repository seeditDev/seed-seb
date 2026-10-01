import { createFileRoute, redirect } from "@tanstack/react-router";

import { createRouteAdapter } from '@/components/routeAdapter';

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      try {
        const authData = localStorage.getItem("auth_data");
        const role = localStorage.getItem("role") || "student";
        if (authData) {
          const parsed = JSON.parse(authData);
          if (parsed && (parsed.uid || parsed.email)) {
            const target = (role === "admin" || role === "staff") ? "/admin/questions" : "/student/dashboard";
            throw redirect({ to: target, replace: true });
          }
        }
      } catch (e: any) {
        if (e && typeof e === "object" && ("to" in e || "statusCode" in e)) {
          throw e;
        }
      }
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — SEED-SEB Secure Exam Portal" },
      {
        name: "description",
        content:
          "Sign in to the SEED-SEB secure exam portal to take proctored MCQ, coding and spoken-English assessments.",
      },
      { property: "og:title", content: "Sign in — SEED-SEB Secure Exam Portal" },
      {
        property: "og:description",
        content: "Secure, proctored assessments for students inside the SEED-SEB desktop app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createRouteAdapter(() => import("@/components/Login")),
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home")({
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
    throw redirect({ to: "/login", replace: true });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth, db } from "@/lib/firebase-config";
import { doc, getDoc } from "firebase/firestore";

import { createRouteAdapter } from '@/components/routeAdapter';

async function fetchCallerRole(uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return (snap.exists() ? snap.data()?.role : null) ?? 'student';
  } catch {
    return 'student';
  }
}

export const Route = createFileRoute("/admin/questions")({
  beforeLoad: async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw redirect({ to: '/login' });
    const role = await fetchCallerRole(currentUser.uid);
    if (role !== 'admin' && role !== 'staff' && role !== 'superadmin') {
      throw redirect({ to: '/student/dashboard' });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin Question Bank — SEED-SEB" },
      {
        name: "description",
        content:
          "Admin question bank management for challenges, contests, and user permissions.",
      },
      { property: "og:title", content: "Admin Question Bank — SEED-SEB" },
      {
        property: "og:description",
        content: "Admin question bank for SEED-SEB.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createRouteAdapter(() => import("@/components/AdminQuestionBank")),
});

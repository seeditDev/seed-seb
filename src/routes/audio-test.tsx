import { createFileRoute } from '@tanstack/react-router'
import AudioTestStudio from "@/components/AudioTestStudio";

export const Route = createFileRoute("/audio-test")({
  head: () => ({
    meta: [
      { title: "Audio Proctoring Calibration Studio — SEED-SEB" },
      {
        name: "description",
        content: "Interactive audio proctoring calibration studio to tune threshold values, test keyboard transient rejection, and verify voice detection in real time.",
      },
      { property: "og:title", content: "Audio Proctoring Calibration Studio — SEED-SEB" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AudioTestStudio,
});

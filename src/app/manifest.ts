import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Filosage — Turn curiosity into understanding",
    short_name: "Filosage",
    description: "AI-assisted learning paths with source-aware lessons, applied practice, and inspectable progress.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAF7",
    theme_color: "#0D1B3D",
    icons: [
      {
        src: "/brand/logo/filosage-icon.png",
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

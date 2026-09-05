import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Today's Work",
    short_name: "Today's Work",
    description: "Simple daily task checklist for office staff.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3fa",
    theme_color: "#16132a",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

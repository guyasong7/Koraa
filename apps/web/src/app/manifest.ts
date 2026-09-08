import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Koraa",
    short_name: "Koraa",
    description:
      "The e-commerce platform built for Cameroonian businesses to sell anywhere.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#120c04",
    theme_color: "#a8530f",
    icons: [
      {
        src: "/koraa-logo.png",
        sizes: "250x100",
        type: "image/png",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}

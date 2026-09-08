import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Koraa — Open your online shop in Cameroon";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage() {
  const imgData = await readFile(
    join(process.cwd(), "public", "images", "og-preview.png"),
  );

  return new Response(imgData, {
    headers: { "Content-Type": "image/png" },
  });
}

"use client";

import { useEffect, useState } from "react";

import type { UserProfile } from "@/lib/api";

/**
 * The user's picture, or their initial when there isn't one.
 *
 * Two sources feed this, in order: `avatar`, which the merchant uploaded to our
 * own storage, and `avatar_url`, which the identity provider hosts. The upload
 * wins — someone who took the trouble to choose a photo should not see it
 * replaced by their Google one on the next sign-in.
 *
 * A plain `<img>` rather than `next/image`: these are 32-64px, provider URLs
 * would each need a `remotePatterns` entry, and routing them through the
 * optimizer buys nothing at this size. `referrerPolicy` is not optional —
 * Google's CDN answers 403 for some referrers, which is exactly the broken
 * image the fallback below exists to avoid.
 */
export default function UserAvatar({
  user,
  size,
  radius = "50%",
  background = "var(--brand-600)",
  color = "#ffffff",
  fontSize,
}: {
  user: Pick<UserProfile, "full_name" | "email" | "avatar" | "avatar_url"> | null | undefined;
  size: number;
  /** CSS border-radius. "50%" for a circle, a token for a rounded square. */
  radius?: string;
  background?: string;
  color?: string;
  /** Defaults to a readable proportion of `size`. */
  fontSize?: number;
}) {
  const src = user?.avatar || user?.avatar_url || "";
  const [failed, setFailed] = useState(false);

  // A new src deserves a fresh attempt; without this, one dead URL would keep
  // showing the initial even after the user uploaded a working photo.
  useEffect(() => setFailed(false), [src]);

  const initial =
    (user?.full_name?.trim()?.[0] || user?.email?.[0] || "K").toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: fontSize ?? Math.round(size * 0.4),
        fontWeight: 700,
        color,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
    </div>
  );
}

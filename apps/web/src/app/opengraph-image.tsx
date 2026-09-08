import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Koraa — Open your online shop in Cameroon";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_600 = "#a8530f";
const BRAND_400 = "#d97b2b";
const BRAND_300 = "#e8ae63";
const BG_DARK = "#120c04";
const BG_CARD = "#1c1209";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          background: `linear-gradient(145deg, ${BG_DARK} 0%, ${BG_CARD} 50%, ${BG_DARK} 100%)`,
          padding: "60px 80px",
          fontFamily: "Inter, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative gradient orb */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-80px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${BRAND_600}30 0%, transparent 70%)`,
            display: "flex",
          }}
        />

        {/* Bottom accent line */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: `linear-gradient(90deg, ${BRAND_600}, ${BRAND_400}, ${BRAND_600})`,
            display: "flex",
          }}
        />

        {/* Logo mark — simplified K badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            background: `linear-gradient(135deg, ${BRAND_600}, ${BRAND_400})`,
            marginBottom: "32px",
          }}
        >
          <span
            style={{
              fontSize: "36px",
              fontWeight: 800,
              color: "white",
              lineHeight: 1,
            }}
          >
            K
          </span>
        </div>

        {/* Site name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              fontSize: "22px",
              fontWeight: 600,
              color: BRAND_400,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            koraa.cm
          </span>
          <div
            style={{
              width: "40px",
              height: "2px",
              background: BRAND_600,
              display: "flex",
            }}
          />
          <span
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "#8a7a6a",
            }}
          >
            E-commerce for Cameroon
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: "56px",
            fontWeight: 800,
            color: "#faf5ef",
            lineHeight: 1.15,
            margin: "0 0 20px 0",
            maxWidth: "800px",
            letterSpacing: "-0.02em",
          }}
        >
          Open your online shop
          <br />
          in Cameroon
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: "24px",
            fontWeight: 400,
            color: "#b0a090",
            lineHeight: 1.5,
            margin: "0 0 40px 0",
            maxWidth: "700px",
          }}
        >
          A storefront, mobile money checkout, and one dashboard to run
          it all. Free to start.
        </p>

        {/* CTA + payment badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: `linear-gradient(135deg, ${BRAND_600}, ${BRAND_400})`,
              borderRadius: "12px",
              padding: "14px 32px",
            }}
          >
            <span
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "white",
              }}
            >
              Get started free
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 16px",
                borderRadius: "8px",
                border: `1px solid ${BRAND_600}40`,
                background: `${BRAND_600}15`,
              }}
            >
              <span style={{ fontSize: "16px", color: BRAND_300 }}>
                MTN Mobile Money
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 16px",
                borderRadius: "8px",
                border: `1px solid ${BRAND_600}40`,
                background: `${BRAND_600}15`,
              }}
            >
              <span style={{ fontSize: "16px", color: BRAND_300 }}>
                Orange Money
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

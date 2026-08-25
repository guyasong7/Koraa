"use client";

/**
 * Blueprint — guided storefront setup.
 *
 * Six visual questions instead of a colour picker and a font dropdown.
 * Each step offers whole decisions the backend curated (a palette, a type
 * pairing, a style kit) and the preview on the right updates the instant
 * one is clicked, so the merchant is choosing a storefront rather than
 * choosing values and hoping.
 *
 * Nothing about the options lives here. The palettes, pairings, kits and
 * section copy all arrive from `/storefront/blueprint/`, which reads
 * `backend/apps/storefront/blueprint.py`. That is what guarantees the
 * swatch shown is the colour applied — this file cannot disagree with the
 * backend because it has no opinions to disagree with.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuMonitor,
  LuSmartphone,
  LuTablet,
  LuSparkles,
} from "react-icons/lu";
import {
  blueprintApi,
  storefrontApi,
  type BlueprintCatalogue,
  type BlueprintPalette,
  type BlueprintPairing,
  type BlueprintStyleKit,
  type StorefrontConfig,
  type StorefrontSection,
} from "@/lib/api";
import { fontStack } from "@/components/StorefrontRenderer";
import "./blueprint.css";

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "category", label: "What do you sell?",       sub: "This sets the starting layout and the tone of the placeholder copy." },
  { key: "palette",  label: "Pick a colour palette",   sub: "Five colours chosen as a set. Each one is checked for legible text." },
  { key: "pairing",  label: "Choose your typefaces",   sub: "A face for headings and one for body copy, shown in themselves." },
  { key: "style",    label: "Pick a style",            sub: "Corner shape and how much room each product gets." },
  { key: "sections", label: "Build your homepage",     sub: "Switch sections on or off. You can edit the words afterwards." },
  { key: "review",   label: "Ready to apply",          sub: "This writes a draft. Nothing goes live until you publish." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

// ── Small pieces ──────────────────────────────────────────────────────────────

function Card({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`bp-card${on ? " on" : ""}`} onClick={onClick} aria-pressed={on}>
      {on && (
        <span className="bp-tick">
          <LuCheck size={12} strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

function PaletteSwatch({ p }: { p: BlueprintPalette }) {
  // Widths track how much of the storefront each colour actually covers.
  const bars: Array<[string, number]> = [
    [p.background_color, 34],
    [p.primary_color, 30],
    [p.accent_color, 14],
    [p.secondary_color, 14],
    [p.text_color, 8],
  ];
  return (
    <div className="bp-swatch">
      {bars.map(([color, width], i) => (
        <span key={i} style={{ background: color, width: `${width}%` }} />
      ))}
    </div>
  );
}

function Specimen({ p }: { p: BlueprintPairing }) {
  return (
    <div className="bp-specimen">
      <div className="bp-specimen-h" style={{ fontFamily: fontStack(p.heading_font, "Outfit") }}>
        New Season Arrivals
      </div>
      <div className="bp-specimen-p" style={{ fontFamily: fontStack(p.font, "Inter") }}>
        Hand-picked pieces, delivered across Cameroon in two to four days.
      </div>
    </div>
  );
}

function KitSketch({ k }: { k: BlueprintStyleKit }) {
  const radius = k.button_style === "square" ? 0 : k.button_style === "pill" ? 9999 : 6;
  // Same proportions the renderer gives each card style, at 1/6 scale.
  const card =
    k.product_card_style === "compact"
      ? { w: 22, h: 22 }
      : k.product_card_style === "large"
        ? { w: 34, h: 45 }
        : { w: 28, h: 28 };
  return (
    <div className="bp-kit">
      <span className="bp-kit-btn" style={{ borderRadius: radius }}>
        Shop
      </span>
      <span className="bp-kit-cards">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="bp-kit-card"
            style={{ width: card.w, height: card.h, borderRadius: radius === 9999 ? 6 : radius }}
          />
        ))}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BlueprintWizard() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.id as string;

  const [cat, setCat] = useState<BlueprintCatalogue | null>(null);
  const [liveConfig, setLiveConfig] = useState<StorefrontConfig | null>(null);
  const [liveSections, setLiveSections] = useState<StorefrontSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [palette, setPalette] = useState("");
  const [pairing, setPairing] = useState("");
  const [styleKit, setStyleKit] = useState("");
  const [sections, setSections] = useState<string[]>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  // Which answers the merchant has chosen deliberately, rather than inherited
  // from the category recommendation. Not state — nothing renders from it.
  const touched = useRef(new Set<string>());

  const step: StepKey = STEPS[stepIndex].key;

  // ── Load ──
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    (async () => {
      try {
        // The catalogue call creates the config and preset sections if the
        // store has none, so it has to settle before the sections read —
        // otherwise a brand-new store loads an empty section list.
        const catRes = await blueprintApi.getCatalogue(storeId);
        const [cfgRes, secRes] = await Promise.all([
          storefrontApi.getConfig(storeId),
          storefrontApi.getSections(storeId),
        ]);
        if (cancelled) return;

        const data = catRes.data;
        setCat(data);
        setLiveConfig(cfgRes.data);
        setLiveSections(secRes.data?.results ?? secRes.data ?? []);

        setCategory(data.defaults.category);
        setPalette(data.defaults.palette);
        setPairing(data.defaults.pairing);
        setStyleKit(data.defaults.style_kit);
        // Open on what the shop looks like now, not on the preset — a
        // merchant re-running the wizard should see their own homepage.
        setSections(
          data.current.sections.length ? data.current.sections : data.defaults.sections
        );
      } catch {
        if (!cancelled) setLoadError("Could not load Blueprint for this store.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Changing the category re-recommends the steps the merchant has not
  // answered yet. An explicit choice is never overwritten: picking "Bold" and
  // then going back to correct the category should not silently undo it, so
  // only untouched answers are re-seeded.
  const pickCategory = (key: string) => {
    if (key === category) return;
    setCategory(key);
    const c = cat?.categories.find((x) => x.key === key);
    if (!c) return;
    if (!touched.current.has("palette")) setPalette(c.recommends.palette);
    if (!touched.current.has("pairing")) setPairing(c.recommends.pairing);
    if (!touched.current.has("style")) setStyleKit(c.recommends.style_kit);
    if (!touched.current.has("sections")) setSections(c.recommends.sections);
  };

  const pick = (what: "palette" | "pairing" | "style", key: string) => {
    touched.current.add(what);
    if (what === "palette") setPalette(key);
    else if (what === "pairing") setPairing(key);
    else setStyleKit(key);
  };

  const toggleSection = (type: string, required: boolean) => {
    if (required) return;
    touched.current.add("sections");
    setSections((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // ── Preview payload ──
  //
  // Built from the pending answers, never from the server. That is what
  // makes the preview reflect a click before anything is saved.

  const previewConfig = useMemo<StorefrontConfig | null>(() => {
    if (!cat || !liveConfig) return null;
    const p = cat.palettes.find((x) => x.key === palette);
    const t = cat.pairings.find((x) => x.key === pairing);
    const k = cat.style_kits.find((x) => x.key === styleKit);
    return {
      ...liveConfig,
      ...(p && {
        primary_color: p.primary_color,
        secondary_color: p.secondary_color,
        accent_color: p.accent_color,
        background_color: p.background_color,
        text_color: p.text_color,
      }),
      ...(t && { font: t.font, heading_font: t.heading_font }),
      ...(k && { button_style: k.button_style, product_card_style: k.product_card_style }),
    };
  }, [cat, liveConfig, palette, pairing, styleKit]);

  const previewSections = useMemo<StorefrontSection[]>(() => {
    if (!cat) return [];
    const byType = new Map(liveSections.map((s) => [s.type, s]));

    // Order follows SECTION_MENU, which is the order the wizard lists them
    // in and the order the homepage renders them in. The announcement bar
    // is pinned to the top to match what apply() writes.
    const chosen = cat.sections
      .filter((opt) => sections.includes(opt.type) || opt.required)
      .map((opt, i) => {
        const existing = byType.get(opt.type);
        return {
          id: existing?.id ?? `preview-${opt.type}`,
          type: opt.type,
          order: opt.type === "announcement_bar" ? 0 : i + 1,
          enabled: true,
          // Placeholder copy only for sections that have no row yet. A
          // section the merchant has already written keeps their words.
          settings:
            existing && Object.keys(existing.settings ?? {}).length
              ? existing.settings
              : opt.default_settings,
        } as StorefrontSection;
      })
      .sort((a, b) => a.order - b.order);

    // The renderer draws the footer unconditionally and reads its copy from
    // the section list, so it has to travel with the payload even though it
    // is never a choice.
    const footer = byType.get("footer");
    return footer ? [...chosen, footer] : chosen;
  }, [cat, liveSections, sections]);

  const pushPreview = useCallback(() => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame || !previewConfig) return;
    frame.postMessage(
      {
        type: "KORAA_PREVIEW_UPDATE",
        payload: { config: previewConfig, sections: previewSections },
      },
      // The dashboard and the preview are the same Next app, so our own
      // origin is the correct target. The storefront editor hardcodes
      // "http://localhost:3000" here, which silently stops updating the
      // preview in every deployment that is not a dev laptop.
      window.location.origin
    );
  }, [previewConfig, previewSections]);

  useEffect(() => {
    if (frameReady) pushPreview();
  }, [frameReady, pushPreview]);

  // ── Apply ──
  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      await blueprintApi.apply(storeId, { category, palette, pairing, style_kit: styleKit, sections });
      router.push(`/dashboard/stores/${storeId}/settings`);
    } catch (e: any) {
      const detail = e?.response?.data;
      const first =
        typeof detail === "object" && detail
          ? Object.values(detail).flat()[0]
          : null;
      setApplyError(typeof first === "string" ? first : "Could not apply your blueprint. Please try again.");
      setApplying(false);
    }
  };

  // ── Guards ──
  if (loading) {
    return (
      <div className="bp-center">
        <LuSparkles size={22} />
        <p>Preparing your blueprint…</p>
      </div>
    );
  }
  if (loadError || !cat || !previewConfig) {
    return (
      <div className="bp-center">
        <p>{loadError ?? "Blueprint is unavailable for this store."}</p>
        <button className="btn btn-secondary" onClick={() => router.push(`/dashboard/stores/${storeId}`)}>
          Back to store
        </button>
      </div>
    );
  }

  const token = typeof window !== "undefined" ? localStorage.getItem("koraa_access") : "";
  const name = (key: string, list: Array<{ key: string; name: string }>) =>
    list.find((x) => x.key === key)?.name ?? "—";
  const chosenSectionNames = cat.sections
    .filter((s) => sections.includes(s.type) || s.required)
    .map((s) => s.name);

  const last = stepIndex === STEPS.length - 1;

  return (
    <div className="bp">
      <aside className="bp-panel">
        <div className="bp-head">
          <button
            className="bp-back"
            onClick={() =>
              stepIndex === 0
                ? router.push(`/dashboard/stores/${storeId}`)
                : setStepIndex((i) => i - 1)
            }
          >
            <LuArrowLeft size={14} />
            {stepIndex === 0 ? "Back to store" : STEPS[stepIndex - 1].label}
          </button>

          <div className="bp-rail" role="presentation">
            {STEPS.map((s, i) => (
              <span key={s.key} className={`bp-seg${i <= stepIndex ? " done" : ""}`} />
            ))}
          </div>

          <p className="bp-step">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
          <h1 className="bp-q">{STEPS[stepIndex].label}</h1>
          <p className="bp-sub">{STEPS[stepIndex].sub}</p>
        </div>

        <div className="bp-body">
          {applyError && <div className="bp-err">{applyError}</div>}

          {step === "category" && (
            <div className="bp-grid">
              {cat.categories.map((c) => (
                <Card key={c.key} on={category === c.key} onClick={() => pickCategory(c.key)}>
                  <div className="bp-card-name">{c.name}</div>
                  <div className="bp-card-mood">{c.blurb}</div>
                </Card>
              ))}
            </div>
          )}

          {step === "palette" && (
            <div className="bp-grid cols-2">
              {cat.palettes.map((p) => (
                <Card key={p.key} on={palette === p.key} onClick={() => pick("palette", p.key)}>
                  <PaletteSwatch p={p} />
                  <div className="bp-card-name">{p.name}</div>
                  <div className="bp-card-mood">{p.mood}</div>
                </Card>
              ))}
            </div>
          )}

          {step === "pairing" && (
            <div className="bp-grid">
              {cat.pairings.map((p) => (
                <Card key={p.key} on={pairing === p.key} onClick={() => pick("pairing", p.key)}>
                  <Specimen p={p} />
                  <div className="bp-card-name">{p.name}</div>
                  <div className="bp-card-mood">{p.mood}</div>
                </Card>
              ))}
            </div>
          )}

          {step === "style" && (
            <div className="bp-grid cols-2">
              {cat.style_kits.map((k) => (
                <Card key={k.key} on={styleKit === k.key} onClick={() => pick("style", k.key)}>
                  <KitSketch k={k} />
                  <div className="bp-card-name">{k.name}</div>
                  <div className="bp-card-mood">{k.mood}</div>
                </Card>
              ))}
            </div>
          )}

          {step === "sections" && (
            <div className="bp-rows">
              {cat.sections.map((s) => {
                const on = s.required || sections.includes(s.type);
                return (
                  <button
                    key={s.type}
                    type="button"
                    className={`bp-row${on ? " on" : ""}`}
                    onClick={() => toggleSection(s.type, s.required)}
                    disabled={s.required}
                    aria-pressed={on}
                  >
                    <span className={`bp-box${on ? " on" : ""}`}>
                      {on && <LuCheck size={12} strokeWidth={3} />}
                    </span>
                    <span className="bp-row-txt">
                      <span className="bp-card-name">{s.name}</span>
                      <span className="bp-card-mood" style={{ display: "block" }}>
                        {s.blurb}
                      </span>
                    </span>
                    {s.required && <span className="bp-lock">Always on</span>}
                  </button>
                );
              })}
            </div>
          )}

          {step === "review" && (
            <>
              <div className="bp-review">
                {[
                  ["Sells", name(category, cat.categories), 0],
                  ["Palette", name(palette, cat.palettes), 1],
                  ["Type", name(pairing, cat.pairings), 2],
                  ["Style", name(styleKit, cat.style_kits), 3],
                  ["Homepage", chosenSectionNames.join(", "), 4],
                ].map(([k, v, target]) => (
                  <div className="bp-review-row" key={k as string}>
                    <span className="bp-review-k">{k as string}</span>
                    <span className="bp-review-v">{v as string}</span>
                    <button className="bp-edit" onClick={() => setStepIndex(target as number)}>
                      Change
                    </button>
                  </div>
                ))}
              </div>
              <p className="bp-note">
                Applying saves this as a draft and opens the editor, where you can rewrite
                any of the copy. Your storefront only changes for shoppers when you press
                Publish.
              </p>
            </>
          )}
        </div>

        <div className="bp-foot">
          <span className="bp-spacer" />
          {last ? (
            <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
              {applying ? "Applying…" : "Apply blueprint"}
              {!applying && <LuCheck size={14} />}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setStepIndex((i) => i + 1)}>
              Continue
              <LuArrowRight size={14} />
            </button>
          )}
        </div>
      </aside>

      <main className="bp-preview">
        <div className="bp-devices">
          {(
            [
              ["desktop", LuMonitor],
              ["tablet", LuTablet],
              ["mobile", LuSmartphone],
            ] as const
          ).map(([mode, Icon]) => (
            <button
              key={mode}
              className={`bp-device${device === mode ? " on" : ""}`}
              onClick={() => setDevice(mode)}
              aria-label={`${mode} preview`}
              aria-pressed={device === mode}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>

        <div className={`bp-frame ${device}`}>
          <iframe
            ref={iframeRef}
            src={`/store/preview/${storeId}?token=${token}`}
            title="Storefront preview"
            onLoad={() => setFrameReady(true)}
          />
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PaintBoardIcon,
  SparklesIcon,
  Download01Icon,
  Star01Icon,
  Loading03Icon,
  Search01Icon,
  Filter01Icon,
} from "@hugeicons/core-free-icons";

interface Template {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  template_type: string;
  category: string;
  tags: string[];
  thumbnail: string;
  demo_url: string;
  is_free: boolean;
  price: string;
  currency: string;
  is_featured: boolean;
  is_verified: boolean;
  downloads: number;
  installations: number;
  rating_average: number;
  rating_count: number;
  is_purchased: boolean;
  created_at: string;
  published_at: string;
}

const CATEGORIES = [
  { label: "All Categories", value: "" },
  { label: "Fashion", value: "fashion" },
  { label: "Food & Beverage", value: "food" },
  { label: "Electronics", value: "electronics" },
  { label: "Beauty & Cosmetics", value: "beauty" },
  { label: "General Store", value: "general" },
  { label: "Minimal Design", value: "minimal" },
  { label: "Bold Design", value: "bold" },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    category: "",
    is_free: "",
    search: "",
  });

  useEffect(() => {
    fetchTemplates();
  }, [filter]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.category) params.append("category", filter.category);
      if (filter.is_free) params.append("is_free", filter.is_free);
      if (filter.search) params.append("search", filter.search);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/templates/?${params}`
      );
      const data = await response.json();
      setTemplates(data.results || data);
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const featuredTemplates = templates.filter((t) => t.is_featured);
  const regularTemplates = templates.filter((t) => !t.is_featured);

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)" }}>
      {/* Hero Section */}
      <section style={{ background: "var(--surface-900)", borderBottom: "1px solid var(--border)" }}>
        <div className="sf-container" style={{ padding: "clamp(48px, 8vw, 80px) clamp(16px, 4vw, 32px)", maxWidth: 1400, margin: "0 auto" }}>
          <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "50px", fontSize: 13, fontWeight: 600, color: "var(--brand-400)", marginBottom: 24 }}>
              <HugeiconsIcon icon={SparklesIcon} size={14} /> Marketplace
            </div>
            <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16, fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em" }}>
              Storefront Templates
            </h1>
            <p style={{ fontSize: "clamp(16px, 2.5vw, 20px)", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
              Beautiful, customizable templates for your online store. Apply instantly and start selling today.
            </p>

            {/* Search bar */}
            <div style={{ position: "relative", maxWidth: 600, margin: "0 auto" }}>
              <HugeiconsIcon icon={Search01Icon} size={20} color="var(--text-muted)" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="Search templates..."
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                style={{
                  width: "100%",
                  padding: "14px 20px 14px 48px",
                  fontSize: 16,
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  background: "var(--surface-800)",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-500)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="sf-container" style={{ padding: "clamp(32px, 6vw, 64px) clamp(16px, 4vw, 32px)", maxWidth: 1400, margin: "0 auto" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 14, fontWeight: 600 }}>
            <HugeiconsIcon icon={Filter01Icon} size={18} /> Filter by:
          </div>

          {/* Category */}
          <select
            value={filter.category}
            onChange={(e) => setFilter({ ...filter, category: e.target.value })}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--surface-900)",
              color: "var(--text-primary)",
              cursor: "pointer",
              outline: "none",
              fontWeight: 500,
            }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          {/* Price */}
          <select
            value={filter.is_free}
            onChange={(e) => setFilter({ ...filter, is_free: e.target.value })}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--surface-900)",
              color: "var(--text-primary)",
              cursor: "pointer",
              outline: "none",
              fontWeight: 500,
            }}
          >
            <option value="">All Prices</option>
            <option value="true">Free Only</option>
            <option value="false">Premium Only</option>
          </select>

          {/* Results count */}
          {!loading && (
            <div style={{ marginLeft: "auto", fontSize: 14, color: "var(--text-muted)" }}>
              {templates.length} {templates.length === 1 ? "template" : "templates"}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <HugeiconsIcon icon={Loading03Icon} size={40} className="spin" color="var(--brand-500)" />
            <p style={{ marginTop: 16, color: "var(--text-muted)", fontSize: 14 }}>Loading templates...</p>
          </div>
        )}

        {/* Featured Templates */}
        {!loading && featuredTemplates.length > 0 && (
          <section style={{ marginBottom: 64 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <HugeiconsIcon icon={SparklesIcon} size={24} color="var(--brand-500)" />
              <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, fontFamily: "Outfit, sans-serif" }}>
                Featured Templates
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
              {featuredTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} featured />
              ))}
            </div>
          </section>
        )}

        {/* All Templates */}
        {!loading && (
          <section>
            {featuredTemplates.length > 0 && (
              <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, fontFamily: "Outfit, sans-serif" }}>
                All Templates
              </h2>
            )}
            {templates.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--surface-900)", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div style={{ width: 80, height: 80, margin: "0 auto 20px", borderRadius: "50%", background: "var(--surface-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <HugeiconsIcon icon={PaintBoardIcon} size={40} color="var(--text-muted)" />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No templates found</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                  Try adjusting your filters or search terms
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
                {regularTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template, featured = false }: { template: Template; featured?: boolean }) {
  return (
    <Link
      href={`/templates/${template.slug}`}
      style={{
        display: "block",
        background: "var(--surface-900)",
        border: featured ? "2px solid var(--brand-500)" : "1px solid var(--border)",
        borderRadius: "16px",
        overflow: "hidden",
        transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
        textDecoration: "none",
        color: "inherit",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-6px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 20px 40px rgba(0,0,0,0.15)";
        if (!featured) (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-400)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        if (!featured) (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", width: "100%", height: 200, background: "var(--surface-700)" }}>
        {template.thumbnail ? (
          <Image
            src={template.thumbnail}
            alt={template.name}
            fill
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <HugeiconsIcon icon={PaintBoardIcon} size={48} color="var(--text-muted)" />
          </div>
        )}
        {template.is_featured && (
          <div style={{ position: "absolute", top: 12, left: 12, padding: "6px 12px", background: "rgba(168,85,247,0.95)", backdropFilter: "blur(8px)", color: "white", fontSize: 12, fontWeight: 700, borderRadius: "8px", display: "flex", alignItems: "center", gap: 6 }}>
            <HugeiconsIcon icon={SparklesIcon} size={14} /> Featured
          </div>
        )}
        {template.is_verified && (
          <div style={{ position: "absolute", top: 12, right: 12, padding: "6px 12px", background: "rgba(59,130,246,0.95)", backdropFilter: "blur(8px)", color: "white", fontSize: 12, fontWeight: 700, borderRadius: "8px" }}>
            ✓ Verified
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, fontFamily: "Outfit, sans-serif", lineHeight: 1.3 }}>
          {template.name}
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {template.description}
        </p>

        {/* Author */}
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          by {template.author.first_name || template.author.email.split("@")[0]}
        </p>

        {/* Stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <HugeiconsIcon icon={Download01Icon} size={14} />
            <span>{template.downloads}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <HugeiconsIcon icon={Star01Icon} size={14} color="var(--warning)" />
            <span>
              {template.rating_average.toFixed(1)} ({template.rating_count})
            </span>
          </div>
        </div>

        {/* Price & CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          {template.is_free ? (
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--success)" }}>FREE</span>
          ) : (
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--brand-500)" }}>
              {template.price} {template.currency}
            </span>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-500)" }}>
            View Details →
          </span>
        </div>
      </div>
    </Link>
  );
}

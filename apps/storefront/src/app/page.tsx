import { LuSearch, LuShoppingBag, LuLayoutGrid, LuTag, LuTrendingUp, LuPackage, LuShieldCheck, LuClock, LuRefreshCw } from "react-icons/lu";

export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
      <style>{`
        .hero-section {
          background: linear-gradient(135deg, var(--surface), var(--brand-50));
          border: 1px solid var(--border);
          padding: 80px 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .hero-title {
          font-size: 56px;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 20px;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: 320px 320px;
          gap: 24px;
        }
        .bento-item {
          background: var(--surface);
          border: 1px solid var(--border);
          position: relative;
          overflow: hidden;
          padding: 32px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }
        .bento-item:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.08);
          border-color: var(--brand-500);
        }
        .bento-large {
          grid-column: span 2;
          grid-row: span 2;
          background: linear-gradient(135deg, rgba(168,85,247,0.1), rgba(168,85,247,0.02));
        }
        .bento-medium {
          grid-column: span 1;
          grid-row: span 1;
        }
        .bento-icon {
          position: absolute;
          top: 32px;
          right: 32px;
          opacity: 0.1;
          transition: opacity 0.2s, transform 0.2s;
        }
        .bento-item:hover .bento-icon {
          opacity: 0.2;
          transform: scale(1.1);
        }
        @media (max-width: 768px) {
          .hero-section {
            padding: 48px 16px;
          }
          .hero-title {
            font-size: 40px;
          }
          .bento-grid {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
          }
          .bento-large, .bento-medium {
            grid-column: span 1;
            grid-row: span 1;
            min-height: 280px;
          }
        }
      `}</style>

      {/* Premium Hero Banner */}
      <section className="hero-section">
        {/* Subtle decorative circles */}
        <div style={{ position: "absolute", top: -150, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.08), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, left: -50, width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.1), transparent 70%)", pointerEvents: "none" }} />
        
        <div style={{ zIndex: 1, maxWidth: 640 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", background: "rgba(168,85,247,0.1)", color: "var(--brand-600)", fontWeight: 700, fontSize: 12, marginBottom: 24, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Official Store
          </span>
          <h1 className="font-display hero-title">
            Guy Asong <span style={{ color: "var(--brand-500)" }}>Quater</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 18, marginBottom: 40, lineHeight: 1.6 }}>
            Discover premium products, curated collections, and exclusive deals directly from our official storefront marketplace.
          </p>
          
          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <button className="btn btn-primary" style={{ padding: "16px 36px", fontSize: 16, fontWeight: 600 }}>Explore Collection</button>
          </div>
        </div>
      </section>

      {/* Horizontal Category Pills */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 className="font-display" style={{ fontSize: 24, fontWeight: 700 }}>Browse by Category</h2>
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {[
            { label: "All Products", icon: LuLayoutGrid, active: true },
            { label: "New Arrivals", icon: LuTrendingUp, active: false },
            { label: "Best Sellers", icon: LuTag, active: false },
          ].map((cat) => (
            <button key={cat.label} style={{ 
              display: "flex", alignItems: "center", gap: 8, 
              padding: "14px 28px", 
              background: cat.active ? "var(--text-primary)" : "var(--surface)", 
              color: cat.active ? "#fff" : "var(--text-primary)", 
              border: `1px solid ${cat.active ? "var(--text-primary)" : "var(--border)"}`, 
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              transition: "all 0.2s"
            }}>
              <cat.icon size={18} />
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* Featured Collections - Bento Grid */}
      <section className="bento-grid">
        <div className="bento-item bento-large">
          <LuShoppingBag size={180} color="var(--brand-500)" className="bento-icon" style={{ right: -20, top: -20 }} />
          <div>
            <span style={{ display: "inline-block", padding: "4px 12px", background: "#000", color: "#fff", fontSize: 12, fontWeight: 700, marginBottom: 16 }}>NEW ARRIVAL</span>
            <h3 className="font-display" style={{ fontSize: 40, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em" }}>Premium Essentials</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 16, maxWidth: 320, marginBottom: 24 }}>Discover our latest collection of high-quality essentials designed for everyday elegance.</p>
            <button className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 14 }}>Shop Collection</button>
          </div>
        </div>
        
        <div className="bento-item bento-medium">
          <LuTag size={120} color="var(--brand-500)" className="bento-icon" style={{ right: -10, top: 20 }} />
          <div>
            <h3 className="font-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Flash Sale</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>Up to 40% off selected items.</p>
            <span style={{ color: "var(--brand-500)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>Shop Now &rarr;</span>
          </div>
        </div>

        <div className="bento-item bento-medium" style={{ background: "var(--text-primary)", color: "#fff", borderColor: "var(--text-primary)" }}>
          <LuTrendingUp size={120} color="#fff" className="bento-icon" style={{ right: -10, top: 20, opacity: 0.05 }} />
          <div>
            <h3 className="font-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Best Sellers</h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginBottom: 16 }}>Our most loved products this week.</p>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>View Trending &rarr;</span>
          </div>
        </div>
      </section>

      {/* Store Features / Trust Badges */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, marginTop: 24 }}>
        {[
          { icon: LuPackage, title: "Free Shipping", desc: "On orders over 25,000 XAF" },
          { icon: LuShieldCheck, title: "Secure Payment", desc: "100% safe & secure" },
          { icon: LuClock, title: "24/7 Support", desc: "Dedicated customer service" },
          { icon: LuRefreshCw, title: "Easy Returns", desc: "30-day return policy" }
        ].map((feature, i) => (
          <div key={i} className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "32px 24px", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(168,85,247,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <feature.icon size={28} color="var(--brand-500)" />
            </div>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{feature.title}</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>{feature.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { publicStorefrontApi, ShowcaseStore } from "@/lib/api";
import Link from "next/link";
import { LuGlobe, LuExternalLink, LuLoader } from "react-icons/lu";

function StoreCard({ store }: { store: ShowcaseStore }) {
  return (
    <a href={store.url} target="_blank" rel="noopener noreferrer" className="showcase-card">
      <div className="showcase-card-header">
        <div className="showcase-logo-wrap">
          {store.logo ? (
            <img src={store.logo} alt={store.name} className="showcase-logo" />
          ) : (
            <LuGlobe size={24} color="var(--brand-500)" />
          )}
        </div>
        <LuExternalLink size={16} className="showcase-external-icon" />
      </div>
      <div className="showcase-card-body">
        <h3 className="showcase-name">{store.name}</h3>
        <p className="showcase-url">{store.url.replace(/^https?:\/\//, "")}</p>
        {store.tagline && <p className="showcase-tagline">{store.tagline}</p>}
      </div>
    </a>
  );
}

export default function ShowcasePage() {
  const [stores, setStores] = useState<ShowcaseStore[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    publicStorefrontApi.getShowcase()
      .then((res) => setStores(res.data))
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="showcase-page">
      <section className="showcase-hero">
        <div className="lp-wrap" style={{ textAlign: "center" }}>
          <h1 className="showcase-title">Built with Koraa</h1>
          <p className="showcase-subtitle">
            Discover the amazing brands and stores powered by our platform.
          </p>
        </div>
      </section>

      <section className="showcase-grid-section">
        <div className="lp-wrap">
          {isLoading ? (
            <div className="showcase-loading">
              <LuLoader size={32} className="spin" color="var(--brand-500)" />
              <p>Loading stores...</p>
            </div>
          ) : stores.length === 0 ? (
            <div className="showcase-empty">
              <p>No stores are currently showcased.</p>
            </div>
          ) : (
            <div className="showcase-grid">
              {stores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="showcase-cta">
        <div className="lp-wrap" style={{ textAlign: "center" }}>
          <h2>Ready to launch your own store?</h2>
          <Link href="/auth/register" className="lp-btn lp-btn--primary">
            Start for free
          </Link>
        </div>
      </section>

      <style>{`
        .showcase-page {
          padding-top: 100px;
          min-height: 100vh;
          background: var(--surface);
        }

        .showcase-hero {
          padding: 80px 0 60px;
        }

        .showcase-title {
          font-size: clamp(36px, 5vw, 56px);
          font-weight: 800;
          font-family: var(--font-display, "Outfit", sans-serif);
          letter-spacing: -0.03em;
          margin-bottom: 16px;
          color: var(--text-primary);
        }

        .showcase-subtitle {
          font-size: clamp(16px, 2vw, 20px);
          color: var(--text-secondary);
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.5;
        }

        .showcase-grid-section {
          padding-bottom: 100px;
        }

        .showcase-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 24px;
        }

        .showcase-card {
          display: flex;
          flex-direction: column;
          background: var(--surface-900);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 24px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s ease;
          overflow: hidden;
        }

        .showcase-card:hover {
          transform: translateY(-4px);
          border-color: color-mix(in srgb, var(--brand-500) 40%, transparent);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.05);
        }

        .showcase-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }

        .showcase-logo-wrap {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          background: var(--surface-700);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .showcase-logo {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .showcase-external-icon {
          color: var(--text-muted);
          transition: color 0.2s;
        }

        .showcase-card:hover .showcase-external-icon {
          color: var(--brand-500);
        }

        .showcase-name {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 4px;
          color: var(--text-primary);
        }

        .showcase-url {
          font-size: 13px;
          color: var(--brand-500);
          font-weight: 500;
          margin-bottom: 12px;
        }

        .showcase-tagline {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .showcase-loading, .showcase-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 0;
          color: var(--text-secondary);
          gap: 16px;
        }

        .showcase-cta {
          padding: 80px 0;
          background: var(--surface-900);
          border-top: 1px solid var(--border);
        }

        .showcase-cta h2 {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 24px;
          font-family: var(--font-display, "Outfit", sans-serif);
          letter-spacing: -0.02em;
        }
      `}</style>
    </div>
  );
}

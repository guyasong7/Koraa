import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LuMessageCircle } from "react-icons/lu";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Storefront Africa",
  description: "Ecommerce Storefront",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ background: "var(--background)", color: "var(--text-primary)", margin: 0, padding: 0 }}>
        <style>{`
          .navbar {
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 16px 48px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 50;
          }
          .nav-search {
            flex: 1;
            max-width: 540px;
            margin: 0 48px;
          }
          .nav-actions {
            display: flex;
            align-items: center;
            gap: 24px;
          }
          .main-content {
            padding: 32px 48px;
            max-width: 1400px;
            margin: 0 auto;
          }
          .footer-container {
            background: var(--surface);
            border-top: 1px solid var(--border);
            padding: 64px 48px 32px;
            margin-top: 64px;
          }
          .footer-grid {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 48px;
          }
          
          /* Mobile Responsiveness */
          @media (max-width: 768px) {
            .navbar {
              padding: 16px;
              flex-wrap: wrap;
              gap: 16px;
            }
            .nav-search {
              margin: 0;
              order: 3;
              width: 100%;
              max-width: 100%;
              flex-basis: 100%;
            }
            .nav-actions {
              gap: 12px;
            }
            .main-content {
              padding: 16px;
            }
            .footer-container {
              padding: 32px 16px 24px;
              margin-top: 32px;
            }
            .footer-grid {
              gap: 32px;
            }
          }
        `}</style>

        <Navbar />

        {/* Main Content Area */}
        <main className="main-content">
          {children}
        </main>

        {/* Floating Action Button - Message Store */}
        <button style={{ 
          position: "fixed", 
          bottom: 32, 
          right: 32, 
          background: "var(--surface)",
          border: "1px solid var(--border)", 
          color: "var(--brand-500)",
          borderRadius: 0, 
          padding: "16px", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          zIndex: 100
        }}
        title="Message Store">
          <LuMessageCircle size={24} />
        </button>

        {/* Footer */}
        <footer className="footer-container">
          <div className="footer-grid">
            <div>
              <img src="/koraa-logo.png" alt="Koraa Storefront" style={{ height: 40, width: "auto", objectFit: "contain", marginBottom: 16 }} />
              <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
                Discover premium products, curated collections, and exclusive deals directly from our official storefront marketplace.
              </p>
            </div>
            <div>
              <h4 style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Quick Links</h4>
              <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Home</a></li>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>All Products</a></li>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Categories</a></li>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>About Us</a></li>
              </ul>
            </div>
            <div>
              <h4 style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Customer Service</h4>
              <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Contact Us</a></li>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Shipping Policy</a></li>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Returns & Exchanges</a></li>
                <li><a href="#" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>Track Your Order</a></li>
              </ul>
            </div>
          </div>
          <div style={{ maxWidth: 1400, margin: "48px auto 0", paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-muted)", fontSize: 13 }}>
            <span>&copy; {new Date().getFullYear()} Official Store. All rights reserved.</span>
            <span>Powered by <strong>Koraa</strong></span>
          </div>
        </footer>
      </body>
    </html>
  );
}

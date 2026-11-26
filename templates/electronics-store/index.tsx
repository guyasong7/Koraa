import React from 'react';
import { defineTemplate, Store, Product } from '@koraa/storefront-sdk';

/**
 * Electronics Store Template
 *
 * A modern, tech-focused template for electronics and gadget stores.
 * Features a clean design with product specifications, comparison tools,
 * and category filtering perfect for tech products.
 */

export default defineTemplate({
  meta: {
    id: 'electronics-store-v1',
    name: 'Electronics Store Pro',
    version: '1.0.0',
    author: {
      name: 'Koraa Templates',
      email: 'templates@koraa.cm',
      url: 'https://koraa.cm'
    },
    description: 'Professional electronics store template with product specs, filtering, and modern tech aesthetics',
    thumbnail: '/templates/electronics-store/preview.png',
    categories: ['electronics', 'technology', 'gadgets'],
    tags: ['modern', 'tech', 'professional', 'responsive', 'dark-mode'],
    price: 25000, // 25,000 XAF
    demo: 'https://demo.koraa.cm/electronics-store',
  },

  config: {
    colors: {
      primary: '#0066FF',
      secondary: '#1A1A1A',
      accent: '#00E5FF'
    },
    fonts: {
      heading: 'Inter, system-ui, sans-serif',
      body: 'Inter, system-ui, sans-serif'
    },
    layout: {
      maxWidth: '1400px',
      gridColumns: 4,
      productCardStyle: 'modern',
      showSpecs: true
    }
  },

  Layout: ({ children, store }) => {
    const [cartCount, setCartCount] = React.useState(0);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isDarkMode, setIsDarkMode] = React.useState(false);

    return (
      <div className={`electronics-store ${isDarkMode ? 'dark' : 'light'}`}>
        <style>{`
          .electronics-store {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: ${isDarkMode ? '#0A0A0A' : '#FFFFFF'};
            color: ${isDarkMode ? '#FFFFFF' : '#1A1A1A'};
            min-height: 100vh;
            transition: all 0.3s ease;
          }

          /* Header */
          .store-header {
            background: ${isDarkMode ? '#1A1A1A' : '#FFFFFF'};
            border-bottom: 1px solid ${isDarkMode ? '#333' : '#E5E7EB'};
            position: sticky;
            top: 0;
            z-index: 1000;
            backdrop-filter: blur(10px);
            background: ${isDarkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
          }

          .header-top {
            background: ${isDarkMode ? '#111' : '#F9FAFB'};
            padding: 8px 0;
            font-size: 13px;
            text-align: center;
            border-bottom: 1px solid ${isDarkMode ? '#222' : '#E5E7EB'};
          }

          .header-top .promo {
            color: #0066FF;
            font-weight: 600;
          }

          .header-main {
            max-width: 1400px;
            margin: 0 auto;
            padding: 16px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 32px;
          }

          .store-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 24px;
            font-weight: 700;
            color: #0066FF;
            text-decoration: none;
          }

          .logo-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #0066FF 0%, #00E5FF 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px;
          }

          .search-bar {
            flex: 1;
            max-width: 600px;
            position: relative;
          }

          .search-input {
            width: 100%;
            padding: 12px 48px 12px 48px;
            border: 2px solid ${isDarkMode ? '#333' : '#E5E7EB'};
            border-radius: 12px;
            background: ${isDarkMode ? '#1A1A1A' : '#F9FAFB'};
            color: ${isDarkMode ? '#FFF' : '#1A1A1A'};
            font-size: 15px;
            outline: none;
            transition: all 0.2s;
          }

          .search-input:focus {
            border-color: #0066FF;
            background: ${isDarkMode ? '#222' : '#FFF'};
          }

          .search-icon {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: ${isDarkMode ? '#888' : '#6B7280'};
            font-size: 20px;
          }

          .header-actions {
            display: flex;
            align-items: center;
            gap: 20px;
          }

          .action-btn {
            background: none;
            border: none;
            color: ${isDarkMode ? '#FFF' : '#1A1A1A'};
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            transition: all 0.2s;
            position: relative;
            font-size: 24px;
          }

          .action-btn:hover {
            background: ${isDarkMode ? '#333' : '#F3F4F6'};
          }

          .cart-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            background: #0066FF;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
          }

          /* Navigation */
          .store-nav {
            background: ${isDarkMode ? '#1A1A1A' : '#F9FAFB'};
            border-bottom: 1px solid ${isDarkMode ? '#333' : '#E5E7EB'};
          }

          .nav-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 24px;
            display: flex;
            gap: 32px;
            overflow-x: auto;
          }

          .nav-link {
            padding: 16px 0;
            color: ${isDarkMode ? '#AAA' : '#6B7280'};
            text-decoration: none;
            font-weight: 500;
            white-space: nowrap;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
          }

          .nav-link:hover {
            color: #0066FF;
            border-bottom-color: #0066FF;
          }

          /* Main Content */
          .main-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 32px 24px;
            min-height: 60vh;
          }

          /* Hero Section */
          .hero-section {
            background: linear-gradient(135deg, #0066FF 0%, #00E5FF 100%);
            border-radius: 24px;
            padding: 64px 48px;
            margin-bottom: 48px;
            color: white;
            position: relative;
            overflow: hidden;
          }

          .hero-content {
            position: relative;
            z-index: 1;
            max-width: 600px;
          }

          .hero-title {
            font-size: 48px;
            font-weight: 800;
            margin: 0 0 16px 0;
            line-height: 1.1;
          }

          .hero-subtitle {
            font-size: 20px;
            opacity: 0.95;
            margin-bottom: 32px;
          }

          .hero-cta {
            display: inline-block;
            background: white;
            color: #0066FF;
            padding: 16px 32px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
            transition: all 0.2s;
          }

          .hero-cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
          }

          .hero-pattern {
            position: absolute;
            right: -100px;
            top: -100px;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            border-radius: 50%;
          }

          /* Categories */
          .categories-section {
            margin-bottom: 48px;
          }

          .section-title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 24px;
          }

          .categories-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
          }

          .category-card {
            background: ${isDarkMode ? '#1A1A1A' : '#F9FAFB'};
            border: 1px solid ${isDarkMode ? '#333' : '#E5E7EB'};
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
          }

          .category-card:hover {
            border-color: #0066FF;
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0, 102, 255, 0.1);
          }

          .category-icon {
            font-size: 36px;
            margin-bottom: 12px;
          }

          .category-name {
            font-weight: 600;
            font-size: 16px;
          }

          /* Footer */
          .store-footer {
            background: ${isDarkMode ? '#1A1A1A' : '#F9FAFB'};
            border-top: 1px solid ${isDarkMode ? '#333' : '#E5E7EB'};
            padding: 48px 24px 24px;
            margin-top: 64px;
          }

          .footer-content {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 48px;
          }

          .footer-section h3 {
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 16px;
            color: #0066FF;
          }

          .footer-links {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .footer-link {
            color: ${isDarkMode ? '#AAA' : '#6B7280'};
            text-decoration: none;
            transition: color 0.2s;
          }

          .footer-link:hover {
            color: #0066FF;
          }

          .footer-bottom {
            max-width: 1400px;
            margin: 32px auto 0;
            padding-top: 24px;
            border-top: 1px solid ${isDarkMode ? '#333' : '#E5E7EB'};
            text-align: center;
            color: ${isDarkMode ? '#888' : '#9CA3AF'};
            font-size: 14px;
          }

          /* Responsive */
          @media (max-width: 768px) {
            .header-main {
              flex-wrap: wrap;
            }

            .search-bar {
              order: 3;
              width: 100%;
              max-width: none;
            }

            .hero-section {
              padding: 48px 24px;
            }

            .hero-title {
              font-size: 32px;
            }

            .categories-grid {
              grid-template-columns: repeat(2, 1fr);
            }

            .footer-content {
              grid-template-columns: 1fr;
            }
          }
        `}</style>

        {/* Header */}
        <header className="store-header">
          <div className="header-top">
            <span className="promo">🎉 Free Shipping on Orders Over 50,000 XAF</span>
          </div>

          <div className="header-main">
            <a href="/" className="store-logo">
              <div className="logo-icon">⚡</div>
              <span>{store.name}</span>
            </a>

            <div className="search-bar">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search for electronics, accessories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="header-actions">
              <button
                className="action-btn"
                onClick={() => setIsDarkMode(!isDarkMode)}
                title={isDarkMode ? 'Light mode' : 'Dark mode'}
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>

              <button className="action-btn" title="Wishlist">
                ❤️
              </button>

              <button className="action-btn" title="Cart">
                🛒
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </button>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="store-nav">
          <div className="nav-container">
            <a href="#phones" className="nav-link">📱 Smartphones</a>
            <a href="#laptops" className="nav-link">💻 Laptops</a>
            <a href="#audio" className="nav-link">🎧 Audio</a>
            <a href="#cameras" className="nav-link">📷 Cameras</a>
            <a href="#gaming" className="nav-link">🎮 Gaming</a>
            <a href="#accessories" className="nav-link">🔌 Accessories</a>
            <a href="#deals" className="nav-link">🔥 Deals</a>
          </div>
        </nav>

        {/* Hero */}
        <main className="main-content">
          <section className="hero-section">
            <div className="hero-pattern"></div>
            <div className="hero-content">
              <h1 className="hero-title">Latest Tech at Unbeatable Prices</h1>
              <p className="hero-subtitle">
                Discover cutting-edge electronics, smartphones, laptops and more.
                Shop with confidence and fast delivery across Cameroon.
              </p>
              <a href="#products" className="hero-cta">Shop Now →</a>
            </div>
          </section>

          {/* Categories */}
          <section className="categories-section">
            <h2 className="section-title">Shop by Category</h2>
            <div className="categories-grid">
              <div className="category-card">
                <div className="category-icon">📱</div>
                <div className="category-name">Smartphones</div>
              </div>
              <div className="category-card">
                <div className="category-icon">💻</div>
                <div className="category-name">Laptops</div>
              </div>
              <div className="category-card">
                <div className="category-icon">🎧</div>
                <div className="category-name">Audio</div>
              </div>
              <div className="category-card">
                <div className="category-icon">📷</div>
                <div className="category-name">Cameras</div>
              </div>
              <div className="category-card">
                <div className="category-icon">⌚</div>
                <div className="category-name">Wearables</div>
              </div>
              <div className="category-card">
                <div className="category-icon">🎮</div>
                <div className="category-name">Gaming</div>
              </div>
            </div>
          </section>

          {/* Main content (products will be rendered here) */}
          {children}
        </main>

        {/* Footer */}
        <footer className="store-footer">
          <div className="footer-content">
            <div className="footer-section">
              <h3>Customer Service</h3>
              <div className="footer-links">
                <a href="#contact" className="footer-link">Contact Us</a>
                <a href="#shipping" className="footer-link">Shipping Info</a>
                <a href="#returns" className="footer-link">Returns & Exchanges</a>
                <a href="#warranty" className="footer-link">Warranty</a>
              </div>
            </div>

            <div className="footer-section">
              <h3>About</h3>
              <div className="footer-links">
                <a href="#about" className="footer-link">About Us</a>
                <a href="#stores" className="footer-link">Store Locations</a>
                <a href="#careers" className="footer-link">Careers</a>
                <a href="#blog" className="footer-link">Tech Blog</a>
              </div>
            </div>

            <div className="footer-section">
              <h3>Payment Methods</h3>
              <div className="footer-links">
                <span className="footer-link">MTN Mobile Money</span>
                <span className="footer-link">Orange Money</span>
                <span className="footer-link">Cash on Delivery</span>
              </div>
            </div>

            <div className="footer-section">
              <h3>Stay Connected</h3>
              <div className="footer-links">
                <a href="#facebook" className="footer-link">Facebook</a>
                <a href="#instagram" className="footer-link">Instagram</a>
                <a href="#twitter" className="footer-link">Twitter</a>
                <a href="#whatsapp" className="footer-link">WhatsApp</a>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p>© 2026 {store.name}. All rights reserved. Powered by Koraa.</p>
          </div>
        </footer>
      </div>
    );
  }
});

# Koraa Storefront SDK Developer Guide

The official guide for building custom storefront templates for the Koraa e-commerce platform.

## Table of Contents

1. [Overview](#overview)
2. [Installation and Setup](#installation-and-setup)
3. [Core Concepts](#core-concepts)
4. [Quick Start Tutorial](#quick-start-tutorial)
5. [Advanced Features](#advanced-features)
6. [Example Template Variations](#example-template-variations)
7. [Best Practices](#best-practices)
8. [Common Patterns and Recipes](#common-patterns-and-recipes)
9. [Troubleshooting](#troubleshooting)
10. [API Reference](#api-reference)

---

## Overview

### What is the Koraa Storefront SDK?

The `@koraa/storefront-sdk` is a React-based library that enables developers to create custom, branded storefront templates for merchants on the Koraa platform. With this SDK, you can:

- Build reusable, customizable storefront templates
- Access store data, products, and cart functionality through React hooks
- Create templates that work seamlessly with Koraa's infrastructure
- Monetize your templates through the marketplace (70% creator share, 30% platform)

### Key Features

- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **React-first**: Built for React 18+ with modern hooks API
- **Flexible**: Customize colors, fonts, layouts, and behavior
- **Store Context**: Access store data, products, and cart state anywhere in your template
- **Validation**: Built-in template validation and sanitization
- **Marketplace Ready**: Templates can be published and sold in the Koraa marketplace

### Who Should Use This?

- Frontend developers familiar with React and TypeScript
- Designers building e-commerce themes
- Agencies creating custom storefronts for clients
- Template creators looking to monetize their designs

---

## Installation and Setup

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- React 18+ or React 19+
- Basic understanding of React hooks and components

### Installing the SDK

```bash
npm install @koraa/storefront-sdk
```

or

```bash
yarn add @koraa/storefront-sdk
```

### Project Structure

A typical template project structure looks like this:

```
my-template/
├── package.json
├── index.tsx          # Main template file
├── components/        # Optional: custom components
├── assets/           # Optional: images, icons
└── test.tsx          # Optional: test file
```

### Basic package.json

```json
{
  "name": "koraa-template-mystore",
  "version": "1.0.0",
  "description": "My custom Koraa template",
  "main": "index.tsx",
  "dependencies": {
    "@koraa/storefront-sdk": "^1.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

---

## Core Concepts

### 1. Template Definition

Every Koraa template is defined using the `defineTemplate` function. This function validates your template structure and returns a properly typed template object.

```tsx
import { defineTemplate } from '@koraa/storefront-sdk';

export default defineTemplate({
  meta: { /* ... */ },
  config: { /* ... */ },
  Layout: ({ children, store }) => { /* ... */ }
});
```

### 2. Template Structure

A template consists of three main parts:

#### **meta**: Template Metadata

Information about your template for the marketplace and Koraa platform.

```tsx
meta: {
  id: 'my-template-v1',           // Unique identifier
  name: 'My Store Template',       // Display name
  version: '1.0.0',                // Semantic version
  author: {
    name: 'Your Name',
    email: 'you@example.com',      // Optional
    url: 'https://yoursite.com'    // Optional
  },
  description: 'A beautiful template for...',
  thumbnail: '/path/to/preview.png',
  categories: ['fashion', 'minimal'],
  tags: ['modern', 'responsive'],
  price: 25000,                    // Price in XAF (optional, for paid templates)
  demo: 'https://demo.koraa.cm/my-template', // Optional
  repository: 'https://github.com/...'       // Optional
}
```

#### **config**: Template Configuration

Optional configuration that defines customizable aspects of your template.

```tsx
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
    // Add any custom layout settings
  }
}
```

#### **Layout**: Main Component

The React component that renders your template. It receives `store` data and renders `children` (product content).

```tsx
Layout: ({ children, store }) => {
  return (
    <div>
      <header>{/* Your header */}</header>
      <main>{children}</main>
      <footer>{/* Your footer */}</footer>
    </div>
  );
}
```

### 3. Data Types

The SDK provides TypeScript types for all data structures:

#### Store

```tsx
interface Store {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo?: string;
  primary_color: string;
  secondary_color: string;
  currency: string;
  domain: string;
}
```

#### Product

```tsx
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  stock: number;
  category?: string;
  is_available: boolean;
}
```

#### CartItem

```tsx
interface CartItem {
  product: Product;
  quantity: number;
}
```

### 4. React Hooks

The SDK provides hooks to access store data, products, and cart functionality:

- `useKoraaStore()`: Access store information
- `useKoraaProducts()`: Access product catalog
- `useKoraaCart()`: Access cart state and actions
- `useKoraa()`: Access entire context (store, products, cart)

**Important**: These hooks must be used within a `KoraaProvider` (provided by the Koraa platform at runtime).

---

## Quick Start Tutorial

Let's build a simple storefront template step by step.

### Step 1: Create the Project

```bash
mkdir koraa-template-simple
cd koraa-template-simple
npm init -y
npm install @koraa/storefront-sdk react react-dom
npm install -D @types/react @types/react-dom typescript
```

### Step 2: Create the Template File

Create `index.tsx`:

```tsx
import React from 'react';
import { defineTemplate } from '@koraa/storefront-sdk';

export default defineTemplate({
  meta: {
    id: 'simple-store-v1',
    name: 'Simple Store',
    version: '1.0.0',
    author: {
      name: 'Your Name'
    },
    description: 'A clean and simple storefront template',
    thumbnail: '/templates/simple/preview.png',
    categories: ['minimal', 'general'],
    tags: ['simple', 'clean', 'responsive']
  },

  config: {
    colors: {
      primary: '#2563EB',
      secondary: '#1E293B',
      accent: '#F59E0B'
    },
    fonts: {
      heading: 'system-ui, sans-serif',
      body: 'system-ui, sans-serif'
    }
  },

  Layout: ({ children, store }) => {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif' }}>
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            background: #F8FAFC;
            color: #1E293B;
          }
          
          .header {
            background: white;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
          }
          
          .store-name {
            font-size: 24px;
            font-weight: 700;
            color: #2563EB;
          }
          
          .main-content {
            padding: 40px 0;
          }
          
          .footer {
            background: #1E293B;
            color: white;
            padding: 40px 20px;
            margin-top: 60px;
            text-align: center;
          }
        `}</style>

        <header className="header">
          <div className="container">
            <h1 className="store-name">{store.name}</h1>
            {store.description && <p>{store.description}</p>}
          </div>
        </header>

        <main className="main-content">
          <div className="container">
            {children}
          </div>
        </main>

        <footer className="footer">
          <div className="container">
            <p>&copy; 2026 {store.name}. Powered by Koraa.</p>
          </div>
        </footer>
      </div>
    );
  }
});
```

### Step 3: Test Your Template

Create `test.tsx`:

```tsx
import React from 'react';
import template from './index';

const mockStore = {
  id: '1',
  name: 'My Test Store',
  slug: 'test-store',
  description: 'A wonderful store selling great products',
  primary_color: '#2563EB',
  secondary_color: '#1E293B',
  currency: 'XAF',
  domain: 'test.koraa.cm'
};

console.log('Template ID:', template.meta.id);
console.log('Template Name:', template.meta.name);
console.log('Template Version:', template.meta.version);
console.log('Layout Component:', typeof template.Layout);
console.log('✅ Template is valid!');
```

Run the test:

```bash
npx tsx test.tsx
```

### Step 4: Add Interactivity

Let's enhance the template with cart functionality:

```tsx
Layout: ({ children, store }) => {
  const [cartOpen, setCartOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        /* Previous styles... */
        
        .header-actions {
          display: flex;
          gap: 20px;
          align-items: center;
          margin-top: 20px;
        }
        
        .search-box {
          flex: 1;
          max-width: 400px;
        }
        
        .search-input {
          width: 100%;
          padding: 10px 16px;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          font-size: 15px;
        }
        
        .cart-button {
          background: #2563EB;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }
        
        .cart-button:hover {
          background: #1D4ED8;
        }
      `}</style>

      <header className="header">
        <div className="container">
          <h1 className="store-name">{store.name}</h1>
          {store.description && <p>{store.description}</p>}
          
          <div className="header-actions">
            <div className="search-box">
              <input
                type="text"
                className="search-input"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <button 
              className="cart-button"
              onClick={() => setCartOpen(!cartOpen)}
            >
              🛒 Cart
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="container">
          {children}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 {store.name}. Powered by Koraa.</p>
        </div>
      </footer>
    </div>
  );
}
```

---

## Advanced Features

### Using React Hooks

The SDK provides powerful hooks to access store data and cart functionality. These hooks are available when your template runs within the Koraa platform.

#### useKoraaStore()

Access store information:

```tsx
import { useKoraaStore } from '@koraa/storefront-sdk';

function Header() {
  const store = useKoraaStore();
  
  return (
    <header>
      <h1>{store.name}</h1>
      <p>{store.description}</p>
      {store.logo && <img src={store.logo} alt={store.name} />}
    </header>
  );
}
```

#### useKoraaProducts()

Access the product catalog:

```tsx
import { useKoraaProducts } from '@koraa/storefront-sdk';

function ProductGrid() {
  const products = useKoraaProducts();
  
  return (
    <div className="grid">
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

#### useKoraaCart()

Manage shopping cart:

```tsx
import { useKoraaCart } from '@koraa/storefront-sdk';

function ProductCard({ product }) {
  const { cart, addToCart, removeFromCart } = useKoraaCart();
  
  const handleAddToCart = () => {
    addToCart(product.id, 1);
  };
  
  const isInCart = cart.some(item => item.product.id === product.id);
  
  return (
    <div className="product-card">
      <img src={product.images[0]} alt={product.name} />
      <h3>{product.name}</h3>
      <p>{product.price} XAF</p>
      <button onClick={handleAddToCart}>
        {isInCart ? 'Added ✓' : 'Add to Cart'}
      </button>
    </div>
  );
}
```

#### useKoraa()

Access everything at once:

```tsx
import { useKoraa } from '@koraa/storefront-sdk';

function Dashboard() {
  const { store, products, cart, addToCart, clearCart } = useKoraa();
  
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity, 
    0
  );
  
  return (
    <div>
      <h2>{store.name} Dashboard</h2>
      <p>Products: {products.length}</p>
      <p>Cart Items: {totalItems}</p>
      <p>Total: {totalPrice} {store.currency}</p>
    </div>
  );
}
```

### KoraaProvider (Runtime)

When your template runs in production, Koraa wraps it with a `KoraaProvider`:

```tsx
// This is done by Koraa platform, not by you
import { KoraaProvider } from '@koraa/storefront-sdk';

<KoraaProvider store={storeData} products={productData}>
  <YourTemplate />
</KoraaProvider>
```

You don't need to add the provider yourself during development, but you can use it for testing:

```tsx
import { KoraaProvider } from '@koraa/storefront-sdk';
import template from './index';

const Template = template.Layout;

function TestApp() {
  return (
    <KoraaProvider 
      store={mockStore} 
      products={mockProducts}
    >
      <Template store={mockStore}>
        <div>Test content</div>
      </Template>
    </KoraaProvider>
  );
}
```

### Validation and Sanitization

The SDK provides utility functions to validate and sanitize data:

#### validateTemplate()

```tsx
import { validateTemplate } from '@koraa/storefront-sdk';

const isValid = validateTemplate(myTemplate);
if (!isValid) {
  console.error('Template structure is invalid');
}
```

#### sanitizeStoreData()

```tsx
import { sanitizeStoreData } from '@koraa/storefront-sdk';

const rawStore = getStoreFromAPI();
const cleanStore = sanitizeStoreData(rawStore);
```

#### sanitizeProducts()

```tsx
import { sanitizeProducts } from '@koraa/storefront-sdk';

const rawProducts = getProductsFromAPI();
const cleanProducts = sanitizeProducts(rawProducts);
```

---

## Example Template Variations

### Fashion Store Template

A template optimized for fashion and apparel:

```tsx
export default defineTemplate({
  meta: {
    id: 'fashion-boutique-v1',
    name: 'Fashion Boutique',
    version: '1.0.0',
    author: { name: 'Fashion Templates Co.' },
    description: 'Elegant template for fashion and clothing stores',
    thumbnail: '/templates/fashion/preview.png',
    categories: ['fashion', 'clothing'],
    tags: ['elegant', 'modern', 'responsive'],
    price: 30000
  },

  config: {
    colors: {
      primary: '#000000',
      secondary: '#FFFFFF',
      accent: '#D4AF37' // Gold accent
    },
    fonts: {
      heading: 'Playfair Display, serif',
      body: 'Inter, sans-serif'
    },
    layout: {
      maxWidth: '1600px',
      gridColumns: 3,
      imageRatio: '3:4' // Portrait for fashion
    }
  },

  Layout: ({ children, store }) => {
    return (
      <div className="fashion-store">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;600&display=swap');
          
          .fashion-store {
            font-family: 'Inter', sans-serif;
            background: #FFFFFF;
            color: #000000;
          }
          
          .fashion-header {
            text-align: center;
            padding: 40px 20px;
            border-bottom: 1px solid #E5E5E5;
          }
          
          .fashion-logo {
            font-family: 'Playfair Display', serif;
            font-size: 36px;
            font-weight: 700;
            letter-spacing: 2px;
            margin-bottom: 10px;
          }
          
          .fashion-nav {
            display: flex;
            justify-content: center;
            gap: 40px;
            padding: 20px;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          
          .fashion-nav a {
            color: #000;
            text-decoration: none;
            transition: color 0.3s;
          }
          
          .fashion-nav a:hover {
            color: #D4AF37;
          }
          
          .hero-banner {
            height: 500px;
            background: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)),
                        url('/hero-fashion.jpg') center/cover;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            text-align: center;
          }
          
          .hero-title {
            font-family: 'Playfair Display', serif;
            font-size: 64px;
            font-weight: 700;
            margin-bottom: 20px;
          }
          
          .hero-subtitle {
            font-size: 18px;
            letter-spacing: 2px;
            text-transform: uppercase;
          }
        `}</style>

        <header className="fashion-header">
          <h1 className="fashion-logo">{store.name}</h1>
          <nav className="fashion-nav">
            <a href="#new">New Arrivals</a>
            <a href="#women">Women</a>
            <a href="#men">Men</a>
            <a href="#accessories">Accessories</a>
            <a href="#sale">Sale</a>
          </nav>
        </header>

        <div className="hero-banner">
          <div>
            <h2 className="hero-title">New Collection</h2>
            <p className="hero-subtitle">Spring/Summer 2026</p>
          </div>
        </div>

        <main style={{ maxWidth: '1600px', margin: '60px auto', padding: '0 20px' }}>
          {children}
        </main>

        <footer style={{ 
          background: '#000', 
          color: '#FFF', 
          padding: '60px 20px',
          textAlign: 'center' 
        }}>
          <p>&copy; 2026 {store.name}</p>
        </footer>
      </div>
    );
  }
});
```

### Food & Restaurant Template

Optimized for food delivery and restaurants:

```tsx
export default defineTemplate({
  meta: {
    id: 'food-delivery-v1',
    name: 'Food Delivery Pro',
    version: '1.0.0',
    author: { name: 'Food Templates' },
    description: 'Appetizing template for restaurants and food delivery',
    thumbnail: '/templates/food/preview.png',
    categories: ['food', 'restaurant'],
    tags: ['appetizing', 'colorful', 'menu'],
    price: 20000
  },

  config: {
    colors: {
      primary: '#FF6B35',
      secondary: '#004E89',
      accent: '#FFC857'
    },
    fonts: {
      heading: 'Poppins, sans-serif',
      body: 'Open Sans, sans-serif'
    },
    layout: {
      maxWidth: '1200px',
      gridColumns: 2,
      imageRatio: '1:1' // Square for food photos
    }
  },

  Layout: ({ children, store }) => {
    const [activeCategory, setActiveCategory] = React.useState('all');

    return (
      <div className="food-store">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Open+Sans:wght@400;600&display=swap');
          
          .food-store {
            font-family: 'Open Sans', sans-serif;
            background: #FFF8F0;
          }
          
          .food-header {
            background: white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            position: sticky;
            top: 0;
            z-index: 100;
          }
          
          .header-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .food-logo {
            font-family: 'Poppins', sans-serif;
            font-size: 28px;
            font-weight: 700;
            color: #FF6B35;
          }
          
          .order-btn {
            background: #FF6B35;
            color: white;
            border: none;
            padding: 12px 32px;
            border-radius: 25px;
            font-weight: 600;
            cursor: pointer;
            font-size: 16px;
          }
          
          .order-btn:hover {
            background: #E5522E;
          }
          
          .menu-categories {
            display: flex;
            gap: 20px;
            padding: 20px;
            overflow-x: auto;
            background: white;
            border-bottom: 2px solid #FFE8DC;
          }
          
          .category-btn {
            background: none;
            border: 2px solid #FF6B35;
            color: #FF6B35;
            padding: 10px 24px;
            border-radius: 20px;
            cursor: pointer;
            white-space: nowrap;
            font-weight: 600;
            transition: all 0.3s;
          }
          
          .category-btn.active {
            background: #FF6B35;
            color: white;
          }
          
          .delivery-banner {
            background: #FFC857;
            padding: 15px;
            text-align: center;
            font-weight: 600;
            color: #004E89;
          }
        `}</style>

        <div className="delivery-banner">
          🚀 Free Delivery on Orders Above 5,000 {store.currency}
        </div>

        <header className="food-header">
          <div className="header-content">
            <h1 className="food-logo">🍔 {store.name}</h1>
            <button className="order-btn">View Cart</button>
          </div>
        </header>

        <div className="menu-categories">
          {['all', 'popular', 'burgers', 'pizza', 'pasta', 'drinks', 'desserts'].map(cat => (
            <button
              key={cat}
              className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <main style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
          {children}
        </main>

        <footer style={{ 
          background: '#004E89', 
          color: 'white', 
          padding: '40px 20px',
          textAlign: 'center' 
        }}>
          <p>🍕 {store.name} - Delicious Food Delivered Fast</p>
          <p>&copy; 2026 Powered by Koraa</p>
        </footer>
      </div>
    );
  }
});
```

### Services/Booking Template

For service-based businesses:

```tsx
export default defineTemplate({
  meta: {
    id: 'services-booking-v1',
    name: 'Services Pro',
    version: '1.0.0',
    author: { name: 'Business Templates' },
    description: 'Professional template for service businesses and bookings',
    thumbnail: '/templates/services/preview.png',
    categories: ['services', 'business'],
    tags: ['professional', 'booking', 'clean'],
    price: 35000
  },

  config: {
    colors: {
      primary: '#6366F1',
      secondary: '#1E293B',
      accent: '#10B981'
    },
    fonts: {
      heading: 'Space Grotesk, sans-serif',
      body: 'Inter, sans-serif'
    },
    layout: {
      maxWidth: '1300px',
      cardStyle: 'elevated'
    }
  },

  Layout: ({ children, store }) => {
    return (
      <div className="services-store">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;600&display=swap');
          
          .services-store {
            font-family: 'Inter', sans-serif;
            background: #F8FAFC;
          }
          
          .services-header {
            background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
            color: white;
            padding: 80px 20px;
            text-align: center;
          }
          
          .services-title {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 48px;
            font-weight: 700;
            margin-bottom: 20px;
          }
          
          .services-subtitle {
            font-size: 20px;
            opacity: 0.95;
            max-width: 600px;
            margin: 0 auto;
          }
          
          .cta-buttons {
            margin-top: 40px;
            display: flex;
            gap: 20px;
            justify-content: center;
          }
          
          .cta-btn {
            padding: 16px 32px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            border: none;
            transition: all 0.3s;
          }
          
          .cta-primary {
            background: white;
            color: #6366F1;
          }
          
          .cta-secondary {
            background: transparent;
            color: white;
            border: 2px solid white;
          }
          
          .features-section {
            max-width: 1300px;
            margin: -60px auto 60px;
            padding: 0 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 30px;
          }
          
          .feature-card {
            background: white;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            text-align: center;
          }
          
          .feature-icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
          
          .feature-title {
            font-weight: 700;
            font-size: 20px;
            margin-bottom: 10px;
          }
        `}</style>

        <header className="services-header">
          <h1 className="services-title">{store.name}</h1>
          <p className="services-subtitle">{store.description}</p>
          <div className="cta-buttons">
            <button className="cta-btn cta-primary">Book Now</button>
            <button className="cta-btn cta-secondary">View Services</button>
          </div>
        </header>

        <div className="features-section">
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3 className="feature-title">Fast Service</h3>
            <p>Quick and efficient service delivery</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">✨</div>
            <h3 className="feature-title">Quality Guaranteed</h3>
            <p>Top-notch quality in everything we do</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💼</div>
            <h3 className="feature-title">Professional</h3>
            <p>Expert team with years of experience</p>
          </div>
        </div>

        <main style={{ maxWidth: '1300px', margin: '0 auto', padding: '0 20px 60px' }}>
          {children}
        </main>

        <footer style={{ 
          background: '#1E293B', 
          color: 'white', 
          padding: '60px 20px',
          textAlign: 'center' 
        }}>
          <p>&copy; 2026 {store.name}. Powered by Koraa.</p>
        </footer>
      </div>
    );
  }
});
```

---

## Best Practices

### 1. Performance

**Keep bundle size small:**
- Use inline styles or CSS-in-JS instead of large CSS frameworks
- Avoid importing entire icon libraries; use emojis or inline SVGs
- Minimize external dependencies

**Optimize images:**
- Use responsive images with proper sizes
- Implement lazy loading for below-the-fold content
- Use modern image formats (WebP) when available

**Code splitting:**
```tsx
// Use React.lazy for heavy components
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

<React.Suspense fallback={<div>Loading...</div>}>
  <HeavyComponent />
</React.Suspense>
```

### 2. Responsive Design

Always design mobile-first:

```css
/* Mobile first (default) */
.grid {
  grid-template-columns: 1fr;
}

/* Tablet */
@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

### 3. Accessibility

**Use semantic HTML:**
```tsx
<header>...</header>
<nav>...</nav>
<main>...</main>
<footer>...</footer>
```

**Include ARIA labels:**
```tsx
<button aria-label="Add to cart">
  <ShoppingCartIcon />
</button>
```

**Keyboard navigation:**
```tsx
<button onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    handleClick();
  }
}}>
  Action
</button>
```

**Color contrast:**
Ensure text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text).

### 4. Localization

Use the store's currency:

```tsx
const { store } = useKoraaStore();

// Format prices
const formatPrice = (price: number) => {
  return `${price.toLocaleString()} ${store.currency}`;
};

// XAF (default for Cameroon)
// Can be USD, EUR, etc.
```

### 5. Error Handling

Handle missing data gracefully:

```tsx
Layout: ({ children, store }) => {
  const logoSrc = store.logo || '/default-logo.png';
  const storeName = store.name || 'Store';
  
  return (
    <div>
      <img 
        src={logoSrc} 
        alt={storeName}
        onError={(e) => {
          e.currentTarget.src = '/fallback.png';
        }}
      />
    </div>
  );
}
```

### 6. SEO-Friendly

Use proper heading hierarchy:

```tsx
<h1>{store.name}</h1>           {/* Page title */}
<h2>Featured Products</h2>       {/* Section title */}
<h3>{product.name}</h3>          {/* Product title */}
```

Include meta information:
```tsx
<head>
  <title>{store.name} - {store.description}</title>
  <meta name="description" content={store.description} />
</head>
```

### 7. Versioning

Follow semantic versioning:
- `1.0.0`: Initial release
- `1.0.1`: Bug fixes
- `1.1.0`: New features (backward compatible)
- `2.0.0`: Breaking changes

Update your template version in `meta.version` when publishing updates.

---

## Common Patterns and Recipes

### Product Grid with Filtering

```tsx
import { useKoraaProducts } from '@koraa/storefront-sdk';

function ProductGrid() {
  const products = useKoraaProducts();
  const [category, setCategory] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');

  const filteredProducts = products.filter(product => {
    const matchesCategory = !category || product.category === category;
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch && product.is_available;
  });

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  return (
    <div>
      <div className="filters">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={category || ''} onChange={(e) => setCategory(e.target.value || null)}>
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div className="grid">
        {filteredProducts.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
```

### Shopping Cart Summary

```tsx
import { useKoraaCart, useKoraaStore } from '@koraa/storefront-sdk';

function CartSummary() {
  const { cart, removeFromCart, updateCartQuantity } = useKoraaCart();
  const store = useKoraaStore();

  const subtotal = cart.reduce((sum, item) => 
    sum + item.product.price * item.quantity, 0
  );

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="cart-summary">
      <h2>Cart ({totalItems} items)</h2>
      
      {cart.length === 0 ? (
        <p>Your cart is empty</p>
      ) : (
        <>
          {cart.map(item => (
            <div key={item.product.id} className="cart-item">
              <img src={item.product.images[0]} alt={item.product.name} />
              <div>
                <h4>{item.product.name}</h4>
                <p>{item.product.price} {store.currency}</p>
              </div>
              <div>
                <button onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}>
                  -
                </button>
                <span>{item.quantity}</span>
                <button onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}>
                  +
                </button>
              </div>
              <button onClick={() => removeFromCart(item.product.id)}>
                Remove
              </button>
            </div>
          ))}
          
          <div className="cart-total">
            <strong>Subtotal:</strong>
            <strong>{subtotal.toLocaleString()} {store.currency}</strong>
          </div>
          
          <button className="checkout-btn">Proceed to Checkout</button>
        </>
      )}
    </div>
  );
}
```

### Product Card Component

```tsx
import { useKoraaCart } from '@koraa/storefront-sdk';
import type { Product } from '@koraa/storefront-sdk';

interface ProductCardProps {
  product: Product;
}

function ProductCard({ product }: ProductCardProps) {
  const { cart, addToCart } = useKoraaCart();
  const [quantity, setQuantity] = React.useState(1);
  
  const isInCart = cart.some(item => item.product.id === product.id);
  const inStock = product.stock > 0 && product.is_available;

  const handleAddToCart = () => {
    if (inStock) {
      addToCart(product.id, quantity);
    }
  };

  return (
    <div className="product-card">
      <div className="product-image">
        <img src={product.images[0] || '/placeholder.png'} alt={product.name} />
        {!inStock && <div className="out-of-stock-badge">Out of Stock</div>}
      </div>
      
      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-description">{product.description}</p>
        
        {product.category && (
          <span className="product-category">{product.category}</span>
        )}
        
        <div className="product-footer">
          <p className="product-price">{product.price.toLocaleString()} XAF</p>
          
          {inStock ? (
            <div className="add-to-cart">
              <input
                type="number"
                min="1"
                max={product.stock}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
              <button onClick={handleAddToCart} disabled={isInCart}>
                {isInCart ? 'Added ✓' : 'Add to Cart'}
              </button>
            </div>
          ) : (
            <button disabled>Out of Stock</button>
          )}
        </div>
        
        <p className="stock-info">
          {inStock ? `${product.stock} in stock` : 'Currently unavailable'}
        </p>
      </div>
    </div>
  );
}
```

### Dark Mode Toggle

```tsx
function useDarkMode() {
  const [isDark, setIsDark] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  React.useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDark));
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return [isDark, setIsDark] as const;
}

// Usage in template
Layout: ({ children, store }) => {
  const [isDark, setIsDark] = useDarkMode();

  return (
    <div className={isDark ? 'dark' : 'light'}>
      <button onClick={() => setIsDark(!isDark)}>
        {isDark ? '☀️' : '🌙'}
      </button>
      {/* rest of template */}
    </div>
  );
}
```

### Image Gallery

```tsx
function ProductImageGallery({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = React.useState(0);

  if (!images || images.length === 0) {
    return <div className="no-image">No images available</div>;
  }

  return (
    <div className="image-gallery">
      <div className="main-image">
        <img src={images[currentIndex]} alt={`Product ${currentIndex + 1}`} />
      </div>
      
      <div className="thumbnail-strip">
        {images.map((img, idx) => (
          <button
            key={idx}
            className={idx === currentIndex ? 'active' : ''}
            onClick={() => setCurrentIndex(idx)}
          >
            <img src={img} alt={`Thumbnail ${idx + 1}`} />
          </button>
        ))}
      </div>
      
      {images.length > 1 && (
        <div className="nav-buttons">
          <button 
            onClick={() => setCurrentIndex((currentIndex - 1 + images.length) % images.length)}
          >
            ←
          </button>
          <button 
            onClick={() => setCurrentIndex((currentIndex + 1) % images.length)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
```

### Sort and Filter Products

```tsx
type SortOption = 'name' | 'price-asc' | 'price-desc' | 'newest';

function useProductFilters(products: Product[]) {
  const [sortBy, setSortBy] = React.useState<SortOption>('name');
  const [minPrice, setMinPrice] = React.useState<number>(0);
  const [maxPrice, setMaxPrice] = React.useState<number>(Infinity);
  const [category, setCategory] = React.useState<string | null>(null);

  const filteredProducts = React.useMemo(() => {
    let result = products.filter(p => {
      const priceMatch = p.price >= minPrice && p.price <= maxPrice;
      const categoryMatch = !category || p.category === category;
      return priceMatch && categoryMatch && p.is_available;
    });

    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
    }

    return result;
  }, [products, sortBy, minPrice, maxPrice, category]);

  return {
    filteredProducts,
    sortBy,
    setSortBy,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,
    category,
    setCategory
  };
}
```

---

## Troubleshooting

### Common Issues

#### 1. "useKoraaStore must be used within KoraaProvider"

**Problem**: You're calling a hook outside of the KoraaProvider context.

**Solution**: 
- In production, Koraa wraps your template automatically
- During development, wrap your test component:

```tsx
import { KoraaProvider } from '@koraa/storefront-sdk';

<KoraaProvider store={mockStore} products={mockProducts}>
  <YourComponent />
</KoraaProvider>
```

#### 2. Template validation fails

**Problem**: `defineTemplate` throws an error about missing fields.

**Solution**: Ensure all required meta fields are present:

```tsx
meta: {
  id: 'unique-id',        // Required
  name: 'Template Name',  // Required
  version: '1.0.0',       // Required
  author: {
    name: 'Your Name'     // Required
  },
  description: 'Description', // Required
  thumbnail: '/path/to/image', // Required
  categories: ['category'],    // Required
  tags: ['tag']                // Required
}
```

#### 3. Images not loading

**Problem**: Product or store images show broken image icons.

**Solution**: 
- Always provide fallback images
- Check image URLs are absolute or properly relative
- Add error handling:

```tsx
<img 
  src={product.images[0] || '/placeholder.png'} 
  alt={product.name}
  onError={(e) => {
    e.currentTarget.src = '/fallback.png';
  }}
/>
```

#### 4. Styles not applying

**Problem**: CSS not rendering correctly.

**Solution**:
- Use `<style>` tags within your component (JSX-compatible)
- Avoid CSS modules or external stylesheets
- Keep all styles inline or in template strings:

```tsx
<div>
  <style>{`
    .my-class {
      color: red;
    }
  `}</style>
  <div className="my-class">Content</div>
</div>
```

#### 5. Cart state not persisting

**Problem**: Cart resets on page refresh.

**Solution**: The Koraa platform handles cart persistence. During development:

```tsx
function usePersistedCart() {
  const [cart, setCart] = React.useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  React.useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  return [cart, setCart] as const;
}
```

#### 6. TypeScript errors

**Problem**: Type errors when using SDK.

**Solution**:
- Install type definitions: `npm install -D @types/react @types/react-dom`
- Import types from SDK:

```tsx
import type { Store, Product, CartItem } from '@koraa/storefront-sdk';
```

#### 7. Performance issues with large product catalogs

**Problem**: Template slows down with many products.

**Solution**: Implement pagination or virtual scrolling:

```tsx
function ProductGrid() {
  const products = useKoraaProducts();
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  
  const paginatedProducts = products.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <>
      <div className="grid">
        {paginatedProducts.map(p => <ProductCard key={p.id} product={p} />)}
      </div>
      <Pagination 
        page={page} 
        totalPages={Math.ceil(products.length / pageSize)}
        onPageChange={setPage}
      />
    </>
  );
}
```

### Debugging Tips

1. **Use console.log to inspect data:**

```tsx
Layout: ({ children, store }) => {
  console.log('Store data:', store);
  console.log('Store colors:', store.primary_color, store.secondary_color);
  
  // ... rest of component
}
```

2. **Validate your template structure:**

```tsx
import { validateTemplate } from '@koraa/storefront-sdk';
import template from './index';

console.log('Is valid?', validateTemplate(template));
```

3. **Check product data:**

```tsx
function ProductDebug() {
  const products = useKoraaProducts();
  console.log('Total products:', products.length);
  console.log('First product:', products[0]);
  console.log('Categories:', new Set(products.map(p => p.category)));
  
  return null;
}
```

4. **Test with mock data:**

Create comprehensive test data to cover edge cases:

```tsx
const mockProducts = [
  // Product with all fields
  {
    id: '1',
    name: 'Full Product',
    description: 'Complete product',
    price: 10000,
    images: ['/img1.jpg', '/img2.jpg'],
    stock: 50,
    category: 'Electronics',
    is_available: true
  },
  // Product with missing optional fields
  {
    id: '2',
    name: 'Minimal Product',
    description: '',
    price: 5000,
    images: [],
    stock: 0,
    is_available: false
  },
  // Product with long text
  {
    id: '3',
    name: 'Product with Very Long Name That Should Wrap',
    description: 'A'.repeat(500),
    price: 999999999,
    images: ['/img.jpg'],
    stock: 1,
    category: 'Category With Spaces',
    is_available: true
  }
];
```

---

## API Reference

### Functions

#### `defineTemplate(template: KoraaTemplate): KoraaTemplate`

Validates and returns a properly structured template.

**Parameters:**
- `template`: Template object with `meta`, `config`, and `Layout`

**Returns:** Validated template object

**Throws:** Error if validation fails

**Example:**
```tsx
const template = defineTemplate({
  meta: { /* ... */ },
  Layout: ({ children, store }) => { /* ... */ }
});
```

---

#### `validateTemplate(template: any): boolean`

Checks if a template object has the correct structure.

**Parameters:**
- `template`: Any object to validate

**Returns:** `true` if valid, `false` otherwise

**Example:**
```tsx
if (validateTemplate(myTemplate)) {
  console.log('Template is valid!');
}
```

---

#### `sanitizeStoreData(store: any): Store`

Sanitizes raw store data, ensuring all fields are properly typed.

**Parameters:**
- `store`: Raw store object from API

**Returns:** Sanitized `Store` object

**Example:**
```tsx
const rawStore = await fetchStore();
const cleanStore = sanitizeStoreData(rawStore);
```

---

#### `sanitizeProducts(products: any[]): Product[]`

Sanitizes raw product array, ensuring all fields are properly typed.

**Parameters:**
- `products`: Raw products array from API

**Returns:** Array of sanitized `Product` objects

**Example:**
```tsx
const rawProducts = await fetchProducts();
const cleanProducts = sanitizeProducts(rawProducts);
```

---

### React Hooks

#### `useKoraaStore(): Store`

Returns store information.

**Returns:** `Store` object

**Throws:** Error if used outside `KoraaProvider`

**Example:**
```tsx
function Header() {
  const store = useKoraaStore();
  return <h1>{store.name}</h1>;
}
```

---

#### `useKoraaProducts(): Product[]`

Returns array of all products.

**Returns:** `Product[]` array

**Throws:** Error if used outside `KoraaProvider`

**Example:**
```tsx
function ProductList() {
  const products = useKoraaProducts();
  return <div>{products.length} products</div>;
}
```

---

#### `useKoraaCart(): CartContext`

Returns cart state and manipulation functions.

**Returns:** Object with:
- `cart: CartItem[]` - Current cart items
- `addToCart: (productId: string, quantity: number) => void`
- `removeFromCart: (productId: string) => void`
- `updateCartQuantity: (productId: string, quantity: number) => void`
- `clearCart: () => void`

**Throws:** Error if used outside `KoraaProvider`

**Example:**
```tsx
function AddToCartButton({ productId }) {
  const { addToCart } = useKoraaCart();
  return (
    <button onClick={() => addToCart(productId, 1)}>
      Add to Cart
    </button>
  );
}
```

---

#### `useKoraa(): TemplateContext`

Returns entire template context (store, products, and cart).

**Returns:** `TemplateContext` object with all context values

**Throws:** Error if used outside `KoraaProvider`

**Example:**
```tsx
function Dashboard() {
  const { store, products, cart } = useKoraa();
  return (
    <div>
      <h1>{store.name}</h1>
      <p>Products: {products.length}</p>
      <p>Cart items: {cart.length}</p>
    </div>
  );
}
```

---

### Components

#### `KoraaProvider`

Context provider for template data. Provided by Koraa platform at runtime.

**Props:**
```tsx
interface KoraaProviderProps {
  store: Store;
  products: Product[];
  children: ReactNode;
}
```

**Example:**
```tsx
<KoraaProvider store={storeData} products={productData}>
  <YourTemplate />
</KoraaProvider>
```

---

### TypeScript Types

#### `Store`

```tsx
interface Store {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo?: string;
  primary_color: string;
  secondary_color: string;
  currency: string;
  domain: string;
}
```

---

#### `Product`

```tsx
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  stock: number;
  category?: string;
  is_available: boolean;
}
```

---

#### `CartItem`

```tsx
interface CartItem {
  product: Product;
  quantity: number;
}
```

---

#### `TemplateMeta`

```tsx
interface TemplateMeta {
  id: string;
  name: string;
  version: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  description: string;
  thumbnail: string;
  categories: string[];
  tags: string[];
  price?: number;
  demo?: string;
  repository?: string;
}
```

---

#### `TemplateConfig`

```tsx
interface TemplateConfig {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  layout?: Record<string, any>;
}
```

---

#### `KoraaTemplate`

```tsx
interface KoraaTemplate {
  meta: TemplateMeta;
  config?: TemplateConfig;
  Layout: React.ComponentType<LayoutProps>;
}
```

---

#### `LayoutProps`

```tsx
interface LayoutProps {
  children: React.ReactNode;
  store: Store;
}
```

---

#### `TemplateContext`

```tsx
interface TemplateContext {
  store: Store;
  products: Product[];
  cart: CartItem[];
  addToCart: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}
```

---

## Publishing Your Template

Once your template is ready, you can publish it to the Koraa marketplace.

### Submission Checklist

- [ ] Template validates with `validateTemplate()`
- [ ] All required meta fields are complete
- [ ] Thumbnail image is high quality (1200x800px recommended)
- [ ] Template is responsive (mobile, tablet, desktop)
- [ ] Accessibility standards met (semantic HTML, ARIA labels)
- [ ] Performance tested with large product catalogs
- [ ] Price set (if paid template)
- [ ] Demo URL provided (optional but recommended)
- [ ] Documentation/README included

### Revenue Sharing

- **Creator receives**: 70% of template price
- **Platform receives**: 30% of template price

Example: 25,000 XAF template
- You receive: 17,500 XAF per sale
- Platform receives: 7,500 XAF per sale

### Template Categories

Choose appropriate categories for discoverability:
- `fashion` - Clothing, apparel, accessories
- `food` - Restaurants, food delivery, cafes
- `electronics` - Tech products, gadgets
- `beauty` - Cosmetics, skincare, wellness
- `services` - Service-based businesses
- `general` - General purpose templates
- `minimal` - Minimalist designs
- `bold` - Bold, eye-catching designs

---

## Support and Resources

### Community

- **Discord**: [discord.koraa.cm](https://discord.koraa.cm)
- **Forum**: [forum.koraa.cm](https://forum.koraa.cm)
- **Twitter**: [@KoraaPlatform](https://twitter.com/koraaplatform)

### Documentation

- **Main Docs**: [docs.koraa.cm](https://docs.koraa.cm)
- **API Reference**: [docs.koraa.cm/api](https://docs.koraa.cm/api)
- **Template Gallery**: [koraa.cm/templates](https://koraa.cm/templates)

### Support

- **Email**: developers@koraa.cm
- **GitHub Issues**: [github.com/koraa/storefront-sdk/issues](https://github.com/koraa/storefront-sdk/issues)

---

## Changelog

### v1.0.0 (2026-01-15)
- Initial release of Storefront SDK
- Core template system with `defineTemplate`
- React hooks: `useKoraaStore`, `useKoraaProducts`, `useKoraaCart`, `useKoraa`
- TypeScript type definitions
- Validation and sanitization utilities
- KoraaProvider context system

---

## License

MIT License - See LICENSE file for details

---

**Happy Building!** 🚀

Create amazing storefronts and join the Koraa template marketplace. If you have questions or need help, reach out to the community or support team.

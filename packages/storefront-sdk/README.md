# @koraa/storefront-sdk

Official SDK for building custom Koraa storefront templates with React and TypeScript.

## 🚀 Quick Start

```bash
npm install @koraa/storefront-sdk
```

```typescript
import { defineTemplate } from '@koraa/storefront-sdk';

export default defineTemplate({
  meta: {
    id: 'my-template',
    name: 'My Awesome Template',
    version: '1.0.0',
    price: 15000, // XAF
    author: {
      name: 'Your Name',
      email: 'you@example.com',
    },
    description: 'A beautiful storefront template',
    thumbnail: '/preview.png',
    categories: ['fashion', 'ecommerce'],
    tags: ['modern', 'responsive'],
  },
  
  Layout: ({ children, store }) => {
    return (
      <div className="min-h-screen">
        <header>
          <h1>{store.name}</h1>
        </header>
        <main>{children}</main>
      </div>
    );
  }
});
```

## 💰 Earn 70% Revenue

Templates built with this SDK earn **70%** of each sale automatically:

- **Template Price:** 25,000 XAF
- **Creator Earns:** 17,500 XAF (70%)
- **Platform Fee:** 7,500 XAF (30%)

## 📦 What's Included

The SDK provides TypeScript types and utilities for:

- ✅ Template definition and metadata
- ✅ Store and product data structures
- ✅ Shopping cart types
- ✅ Layout component types
- ✅ Full TypeScript support

## 🎨 Template Structure

### Required Metadata

```typescript
{
  id: string;              // Unique template identifier
  name: string;            // Display name
  version: string;         // Semantic version (1.0.0)
  price: number;           // Price in XAF
  author: {
    name: string;
    email: string;
    url?: string;
  };
  description: string;     // Short description
  thumbnail: string;       // Preview image URL
  categories: string[];    // e.g., ['fashion', 'electronics']
  tags: string[];         // e.g., ['modern', 'dark-mode']
}
```

### Layout Component

The Layout component receives props:

```typescript
interface LayoutProps {
  children: React.ReactNode;
  store: Store;
  products: Product[];
  cart: CartItem[];
}

const Layout: React.FC<LayoutProps> = ({ children, store, products, cart }) => {
  return (
    <div>
      <nav>
        <h1>{store.name}</h1>
        <span>Cart: {cart.length} items</span>
      </nav>
      <main>{children}</main>
    </div>
  );
};
```

## 📋 Available Types

### Store

```typescript
interface Store {
  id: string;
  name: string;
  description: string;
  logo?: string;
  currency: string;
  owner: string;
}
```

### Product

```typescript
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  stock: number;
  sku: string;
}
```

### CartItem

```typescript
interface CartItem {
  product: Product;
  quantity: number;
  subtotal: number;
}
```

## 🎯 Complete Example

See our [Electronics Store Pro template](https://github.com/guyasong7/Koraa/tree/main/templates/electronics-store) for a full example with:

- 🎨 Dark/light mode toggle
- 📱 Responsive design
- 🛒 Shopping cart integration
- 🔍 Product filtering
- 💳 Checkout flow
- ⭐ Product reviews

## 🛠️ Development

### Local Development

```bash
npm install @koraa/storefront-sdk
```

Create your template file:

```typescript
// my-template/index.tsx
import { defineTemplate } from '@koraa/storefront-sdk';

export default defineTemplate({
  meta: { /* ... */ },
  Layout: ({ children, store }) => { /* ... */ }
});
```

### Template Categories

Choose from:

- `fashion` - Clothing, accessories, apparel
- `electronics` - Gadgets, tech, devices
- `food` - Restaurants, groceries, delivery
- `beauty` - Cosmetics, skincare, wellness
- `home` - Furniture, decor, household
- `sports` - Athletic gear, fitness, outdoor
- `books` - Literature, educational, media
- `art` - Creative, handmade, design

## 📝 Template Guidelines

### Required Features

✅ Responsive design (mobile, tablet, desktop)  
✅ Product listing and details  
✅ Shopping cart integration  
✅ Checkout flow  
✅ Search and filtering  

### Best Practices

✅ Use semantic HTML  
✅ Follow accessibility guidelines (WCAG 2.1)  
✅ Optimize images and assets  
✅ Support dark/light modes (recommended)  
✅ Include loading states  
✅ Handle empty states  
✅ Provide clear CTAs  

### File Structure

```
my-template/
├── index.tsx           # Main template export
├── components/         # Reusable components
│   ├── Header.tsx
│   ├── ProductCard.tsx
│   └── Cart.tsx
├── styles/            # CSS/Tailwind
│   └── globals.css
├── public/            # Static assets
│   ├── preview.png    # Required: template thumbnail
│   └── screenshots/   # Additional previews
├── package.json       # Dependencies
└── README.md          # Template documentation
```

## 🚀 Publishing Your Template

### 1. Create Your Template

Build your template using the SDK and test locally.

### 2. Prepare Assets

- Create a preview thumbnail (1200x800px recommended)
- Take 3-5 screenshots showing key features
- Write clear documentation

### 3. Submit to Koraa

```bash
# Package your template
npm run build

# Submit via Koraa dashboard
# https://koraa.cm/dashboard/templates/submit
```

### 4. Review Process

- ✅ Code quality check
- ✅ Design review
- ✅ Performance testing
- ✅ Accessibility audit
- ✅ Security scan

Approval typically takes 2-3 business days.

### 5. Start Earning

Once approved, your template goes live on the Koraa marketplace and you earn 70% on every sale! 💰

## 📊 Template Pricing Guidelines

| Complexity | Features | Suggested Price |
|------------|----------|----------------|
| **Basic** | Simple layout, basic features | 10,000 - 15,000 XAF |
| **Standard** | Multiple pages, cart, checkout | 15,000 - 25,000 XAF |
| **Premium** | Advanced features, animations | 25,000 - 40,000 XAF |
| **Enterprise** | Full customization, integrations | 40,000+ XAF |

## 🔧 Advanced Features

### Custom Context

Access template context anywhere:

```typescript
import { useTemplateContext } from '@koraa/storefront-sdk';

function MyComponent() {
  const { store, products, cart } = useTemplateContext();
  return <div>{store.name}</div>;
}
```

### Theme Customization

```typescript
export default defineTemplate({
  meta: { /* ... */ },
  
  theme: {
    colors: {
      primary: '#3B82F6',
      secondary: '#10B981',
      accent: '#F59E0B',
    },
    fonts: {
      heading: 'Inter, sans-serif',
      body: 'Open Sans, sans-serif',
    },
  },
  
  Layout: ({ children }) => { /* ... */ }
});
```

### Dynamic Imports

Optimize bundle size with code splitting:

```typescript
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <p>Loading...</p>,
});
```

## 📚 Resources

- **Documentation:** [Full SDK Guide](https://github.com/guyasong7/Koraa/blob/main/SDK_DEVELOPER_GUIDE.md)
- **Example Template:** [Electronics Store Pro](https://github.com/guyasong7/Koraa/tree/main/templates/electronics-store)
- **API Reference:** [Koraa API Docs](https://api.koraa.cm/docs)
- **Support:** support@koraa.cm

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/guyasong7/Koraa/blob/main/CONTRIBUTING.md).

## 📄 License

MIT

## 🌟 Community

- **Discord:** [Join our community](https://discord.gg/koraa)
- **Twitter:** [@KoraaPlatform](https://twitter.com/koraaplatform)
- **GitHub:** [Koraa Repository](https://github.com/guyasong7/Koraa)

---

**Built with ❤️ by the Koraa team**

Start building beautiful storefronts today and earn 70% on every sale! 🚀

# Custom Storefront Templates System - Architecture

**Date:** 2024-11-26  
**Feature:** Open-source template system + Template marketplace

---

## 🎯 Overview

Enable users to:
1. **Build custom Next.js storefront templates** (open source)
2. **Upload templates to Koraa**
3. **Browse template gallery/marketplace**
4. **Purchase/use templates for their stores**
5. **Contribute templates to the community**

---

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Koraa Platform                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │  Template SDK    │────────▶│  Template API    │        │
│  │  (Open Source)   │         │  (Backend)       │        │
│  └──────────────────┘         └──────────────────┘        │
│           │                             │                  │
│           │                             │                  │
│           ▼                             ▼                  │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │  Template        │────────▶│  Template        │        │
│  │  CLI Tool        │         │  Gallery         │        │
│  └──────────────────┘         └──────────────────┘        │
│                                         │                  │
│                                         ▼                  │
│                              ┌──────────────────┐          │
│                              │  Store Renderer  │          │
│                              │  (Runtime)       │          │
│                              └──────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘

External:
  ┌──────────────────┐         ┌──────────────────┐
  │  GitHub Repo     │         │  NPM Package     │
  │  (Templates)     │         │  (SDK)           │
  └──────────────────┘         └──────────────────┘
```

---

## 📦 Components to Build

### 1. Template SDK (Open Source NPM Package)

**Package:** `@koraa/storefront-sdk`

**Purpose:** Provide types, utilities, and helpers for building templates

```typescript
// Template interface
interface KoraaTemplate {
  meta: TemplateMeta;
  layout: LayoutComponent;
  components: TemplateComponents;
  config: TemplateConfig;
}

// Developer uses SDK
import { defineTemplate, useKoraaStore, useKoraaProducts } from '@koraa/storefront-sdk';

export default defineTemplate({
  meta: {
    id: 'modern-boutique',
    name: 'Modern Boutique',
    version: '1.0.0',
    author: 'Your Name',
    description: 'A clean, modern template for fashion stores',
    thumbnail: '/preview.png',
    categories: ['fashion', 'boutique'],
    price: 'free' // or amount
  },
  
  // Template implementation
  layout: ModernBoutiqueLayout,
  components: { ... },
  config: { ... }
});
```

---

### 2. Template CLI Tool

**Package:** `@koraa/template-cli`

**Commands:**
```bash
# Create new template from starter
npx @koraa/template-cli create my-template

# Develop locally with hot reload
npx @koraa/template-cli dev

# Build and validate template
npx @koraa/template-cli build

# Test template with sample data
npx @koraa/template-cli test

# Upload to Koraa marketplace
npx @koraa/template-cli publish --api-key YOUR_KEY
```

---

### 3. Backend API (Django)

**New App:** `backend/apps/templates/`

**Models:**
```python
class Template(models.Model):
    """Storefront template"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    
    # Template metadata
    version = models.CharField(max_length=20)
    thumbnail = models.ImageField(upload_to='templates/thumbnails/')
    screenshots = models.JSONField(default=list)  # List of image URLs
    demo_url = models.URLField(blank=True)
    
    # Categories and tags
    categories = models.JSONField(default=list)
    tags = models.JSONField(default=list)
    
    # Pricing
    is_free = models.BooleanField(default=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Template package
    package_url = models.URLField()  # S3/R2 URL to template zip
    package_hash = models.CharField(max_length=64)  # SHA256 hash
    
    # Metadata
    is_verified = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    downloads = models.IntegerField(default=0)
    rating = models.FloatField(default=0.0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'templates'
        ordering = ['-created_at']

class TemplatePurchase(models.Model):
    """Record of template purchases"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    template = models.ForeignKey(Template, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, null=True)
    
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    transaction = models.ForeignKey(PaymentTransaction, null=True, on_delete=models.SET_NULL)
    
    purchased_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'template_purchases'
        unique_together = [['template', 'user']]

class TemplateReview(models.Model):
    """User reviews for templates"""
    template = models.ForeignKey(Template, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    rating = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'template_reviews'
        unique_together = [['template', 'user']]
```

**Endpoints:**
```python
# GET /api/v1/templates/
# List all templates (with filters)

# GET /api/v1/templates/{slug}/
# Get template details

# POST /api/v1/templates/upload/
# Upload new template (requires auth)

# POST /api/v1/templates/{slug}/purchase/
# Purchase a template

# GET /api/v1/templates/my-templates/
# Get user's purchased templates

# POST /api/v1/templates/{slug}/review/
# Add review/rating

# GET /api/v1/stores/{store_id}/available-templates/
# Get templates user can apply to their store
```

---

### 4. Frontend - Template Gallery

**New Page:** `apps/web/src/app/templates/page.tsx`

**Features:**
- Browse all templates
- Filter by category, price, rating
- Search templates
- Preview demos
- Purchase flow
- Download free templates

**UI Components:**
```typescript
// Template card in gallery
<TemplateCard
  template={template}
  onPreview={() => openPreview(template)}
  onPurchase={() => handlePurchase(template)}
/>

// Template detail page
<TemplateDetail
  template={template}
  screenshots={template.screenshots}
  reviews={reviews}
  author={author}
/>

// Purchase modal
<TemplatePurchaseModal
  template={template}
  price={template.price}
  onConfirm={handlePurchaseConfirm}
/>
```

---

### 5. Template Application System

**How stores use templates:**

```typescript
// In store settings
const applyTemplate = async (storeId: string, templateId: string) => {
  // 1. Check if user owns template (purchased or free)
  const hasAccess = await checkTemplateAccess(storeId, templateId);
  
  if (!hasAccess) {
    throw new Error('Purchase template first');
  }
  
  // 2. Update store configuration
  await updateStore(storeId, {
    template_id: templateId,
    template_version: '1.0.0'
  });
  
  // 3. Store renders with new template
  router.refresh();
};
```

---

## 📋 Template Structure

### Standard Template Package

```
my-template/
├── package.json              # Template metadata
├── README.md                 # Documentation
├── LICENSE                   # License (MIT recommended)
├── preview.png              # Thumbnail image
├── screenshots/             # Gallery images
│   ├── desktop-1.png
│   ├── mobile-1.png
│   └── ...
├── src/
│   ├── index.tsx           # Main entry point
│   ├── layout.tsx          # Layout component
│   ├── components/         # Template components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── ProductCard.tsx
│   │   └── ...
│   ├── styles/             # Styles
│   │   └── theme.css
│   └── config/             # Configuration
│       └── theme.json
└── koraa.config.json       # Koraa template config
```

**koraa.config.json:**
```json
{
  "id": "modern-boutique",
  "name": "Modern Boutique",
  "version": "1.0.0",
  "description": "A clean, modern template for fashion stores",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",
    "url": "https://yoursite.com"
  },
  "koraaVersion": "^1.0.0",
  "categories": ["fashion", "boutique", "ecommerce"],
  "tags": ["modern", "minimalist", "responsive"],
  "pricing": {
    "type": "free",
    "amount": 0,
    "currency": "XAF"
  },
  "demo": "https://demo.koraa.cm/modern-boutique",
  "repository": "https://github.com/yourusername/koraa-template-modern-boutique",
  "features": [
    "Responsive design",
    "Dark mode support",
    "Product filtering",
    "Shopping cart",
    "Contact form"
  ],
  "customization": {
    "colors": true,
    "fonts": true,
    "layout": "flexible"
  }
}
```

---

## 🚀 Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Backend:**
- [ ] Create `backend/apps/templates/` app
- [ ] Define models (Template, TemplatePurchase, TemplateReview)
- [ ] Create migrations
- [ ] Build basic CRUD API endpoints
- [ ] Add template file upload to R2

**Frontend:**
- [ ] Create template gallery page
- [ ] Template card component
- [ ] Template detail page
- [ ] Basic filtering/search

### Phase 2: SDK & CLI (Week 3-4)

**NPM Packages:**
- [ ] Create `@koraa/storefront-sdk`
  - Template types
  - React hooks (useKoraaStore, useKoraaProducts)
  - Utilities
  
- [ ] Create `@koraa/template-cli`
  - `create` command
  - `dev` command
  - `build` command
  - `publish` command

**Documentation:**
- [ ] Developer guide
- [ ] API reference
- [ ] Example templates

### Phase 3: Template Runtime (Week 5-6)

**Integration:**
- [ ] Dynamic template loading system
- [ ] Template isolation/sandboxing
- [ ] Template configuration UI
- [ ] Preview mode

**Store Settings:**
- [ ] "Change Template" section
- [ ] Template browser in dashboard
- [ ] One-click template application

### Phase 4: Marketplace (Week 7-8)

**Features:**
- [ ] Template purchase flow
- [ ] Payment integration
- [ ] Download/license management
- [ ] Template reviews/ratings
- [ ] Author profiles
- [ ] Revenue sharing (if applicable)

**Moderation:**
- [ ] Template review/approval
- [ ] Security scanning
- [ ] Quality checks

---

## 💰 Monetization Options

### Option 1: Free + Premium
- Free templates (open source, community)
- Premium templates (paid, created by team/partners)
- Revenue split: 70% creator, 30% platform

### Option 2: All Free (Community Driven)
- All templates free and open source
- Monetize through:
  - Pro features (custom domains, etc.)
  - Support/customization services
  - Build community and attract users

### Option 3: Freemium Marketplace
- Free tier: Basic templates
- Pro tier: Premium templates included in subscription
- Marketplace: Buy individual premium templates
- Custom: Hire designer for custom template

---

## 🔐 Security Considerations

### Template Sandboxing

```typescript
// Templates run in controlled environment
const TemplateRenderer = ({ template, store, products }) => {
  // 1. Validate template package
  if (!validateTemplate(template)) {
    throw new Error('Invalid template');
  }
  
  // 2. Load in isolated context
  const TemplateComponent = loadTemplate(template);
  
  // 3. Provide controlled API access only
  return (
    <TemplateContext.Provider value={{
      store: sanitizeStoreData(store),
      products: sanitizeProducts(products),
      // No direct API access, no user data
    }}>
      <ErrorBoundary fallback={<DefaultStorefront />}>
        <TemplateComponent />
      </ErrorBoundary>
    </TemplateContext.Provider>
  );
};
```

### Template Review Process

1. **Automated checks:**
   - Code scanning (no malicious code)
   - Dependency audit
   - Performance testing
   - Accessibility checks

2. **Manual review:**
   - Visual QA
   - Functionality testing
   - Brand guideline compliance

3. **Approval:**
   - Mark as verified
   - Feature in gallery
   - Push to production

---

## 📝 Developer Experience

### Creating a Template

```bash
# 1. Create template from starter
npx @koraa/template-cli create my-boutique-template
cd my-boutique-template

# 2. Install dependencies
npm install

# 3. Develop locally
npm run dev
# Opens: http://localhost:3000 with sample store data

# 4. Test with real store
npm run dev -- --store-id=YOUR_STORE_ID

# 5. Build for production
npm run build

# 6. Publish to Koraa
npx @koraa/template-cli publish
# Uploads to Koraa marketplace
```

### Template Starter Code

```typescript
// src/index.tsx
import { defineTemplate, type KoraaTemplate } from '@koraa/storefront-sdk';
import Layout from './layout';
import * as components from './components';

export default defineTemplate({
  meta: {
    id: 'my-boutique-template',
    name: 'My Boutique Template',
    version: '1.0.0',
    // ... metadata
  },
  
  layout: Layout,
  components,
  
  config: {
    // Customization options
    theme: {
      primaryColor: '#000000',
      fontFamily: 'Inter',
    }
  }
}) satisfies KoraaTemplate;

// src/layout.tsx
import { useKoraaStore, useKoraaProducts } from '@koraa/storefront-sdk';
import Header from './components/Header';
import Footer from './components/Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  const store = useKoraaStore();
  const products = useKoraaProducts();
  
  return (
    <div className="template-layout">
      <Header store={store} />
      <main>{children}</main>
      <Footer store={store} />
    </div>
  );
}
```

---

## 🎨 Template Categories

Suggested categories:
- **Fashion & Apparel** - Boutiques, clothing stores
- **Food & Beverage** - Restaurants, cafes, food delivery
- **Services** - Consulting, booking, appointments
- **Digital Products** - Software, downloads, courses
- **Art & Creativity** - Galleries, portfolios
- **Health & Wellness** - Fitness, spa, medical
- **Technology** - Electronics, gadgets
- **Multi-purpose** - Works for any store type

---

## 📊 Analytics & Insights

Track template performance:
- Downloads/purchases
- Active installations
- User ratings
- Conversion rates (by template)
- Popular templates by region/category

Provide to creators:
- Template dashboard
- Revenue reports
- User feedback
- Performance metrics

---

## 🔄 Template Updates

### Version Management

```python
# Template versions
class TemplateVersion(models.Model):
    template = models.ForeignKey(Template, on_delete=models.CASCADE)
    version = models.CharField(max_length=20)  # 1.0.0, 1.1.0, etc.
    changelog = models.TextField()
    package_url = models.URLField()
    released_at = models.DateTimeField(auto_now_add=True)
    
    # Migration guide (if breaking changes)
    migration_guide = models.TextField(blank=True)
```

**Update flow:**
1. Creator publishes new version
2. Stores using template get notification
3. Store owner reviews changelog
4. One-click update (or stay on current version)
5. Automatic backup before update

---

## 🌟 Featured Templates (Built-in)

Ship with 5-7 high-quality templates:
1. **Classic** - Traditional ecommerce layout
2. **Modern** - Clean, minimalist design
3. **Bold** - Eye-catching, colorful
4. **Minimal** - Ultra-simple, fast
5. **Luxury** - High-end, premium feel
6. **Creative** - Unique, artistic layout
7. **Mobile-First** - Optimized for mobile

All free and open source to get started.

---

## 📖 Documentation Structure

**For Template Creators:**
```
docs/templates/
├── getting-started.md        # Quick start guide
├── template-structure.md     # File structure
├── api-reference.md          # SDK API docs
├── components.md             # Available components
├── styling.md                # Styling guidelines
├── testing.md                # Testing templates
├── publishing.md             # Publishing to marketplace
└── examples/                 # Example templates
    ├── minimal-template/
    ├── fashion-template/
    └── food-template/
```

**For Store Owners:**
```
docs/using-templates/
├── choosing-template.md      # How to choose
├── applying-template.md      # Installation
├── customizing.md            # Customization options
├── switching-templates.md    # Changing templates
└── faq.md                    # Common questions
```

---

## 🚦 Quality Guidelines

Templates must:
- ✅ Be responsive (mobile, tablet, desktop)
- ✅ Support dark mode (optional but recommended)
- ✅ Meet accessibility standards (WCAG 2.1 AA)
- ✅ Load in < 3 seconds (Lighthouse score > 90)
- ✅ Work with all Koraa features (cart, checkout, etc.)
- ✅ Include documentation
- ✅ Have clean, maintainable code
- ✅ No hardcoded data or external API calls
- ✅ Follow Koraa design guidelines

---

## 🎯 Success Metrics

Track:
- Number of templates published
- Template adoption rate
- User satisfaction (reviews)
- Template performance (conversion rates)
- Developer engagement
- Marketplace revenue (if monetized)

Goals (Year 1):
- 20+ community templates
- 5000+ template installations
- 4+ star average rating
- Active developer community

---

## 🔗 Integration with Existing System

### Current Storefront System

```typescript
// apps/web/src/app/store/[domain]/layout.tsx
// Current: 7 hardcoded templates

// New: Dynamic template loading
const Template = await loadTemplate(store.template_id);
return <Template store={store} />;
```

**Migration path:**
1. Convert existing 7 templates to new format
2. Package as `@koraa/template-classic`, `@koraa/template-modern`, etc.
3. Users can still use built-in templates
4. Gradually enable custom templates

---

## 📦 Repository Structure

### New Repositories

```
github.com/koraa/storefront-sdk          # SDK package
github.com/koraa/template-cli            # CLI tool
github.com/koraa/template-starter        # Starter template
github.com/koraa/templates               # Official templates
github.com/koraa/template-examples       # Example templates
```

### Community Templates

```
github.com/username/koraa-template-name  # Community template
# Uses @koraa/storefront-sdk
# Published to Koraa marketplace
```

---

## ⚠️ Challenges & Solutions

### Challenge 1: Template Security
**Solution:** Sandbox execution, code review, automated scanning

### Challenge 2: Performance
**Solution:** Template caching, CDN, lazy loading

### Challenge 3: Breaking Changes
**Solution:** Semantic versioning, migration guides, backward compatibility

### Challenge 4: Quality Control
**Solution:** Review process, guidelines, featured templates

### Challenge 5: Developer Adoption
**Solution:** Great DX, documentation, examples, support

---

## 🎉 Launch Strategy

### Beta Phase (1-2 months)
1. Build core system
2. Create SDK + CLI
3. Develop 3-5 official templates
4. Invite 10 developers to beta test
5. Gather feedback, iterate

### Public Launch
1. Release SDK/CLI on NPM
2. Open template marketplace
3. Publish documentation
4. Write launch blog post
5. Social media announcement
6. Developer outreach

### Growth Phase
1. Template contests
2. Featured creators
3. Revenue sharing program
4. Community events
5. Integration partnerships

---

**Next Steps:** Review this architecture and I'll start building!

---

**End of Template System Architecture**

*Last Updated: 2024-11-26*

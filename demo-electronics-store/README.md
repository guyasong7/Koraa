# Electronics Store Pro

A modern, responsive electronics storefront template built with Next.js and the @koraa/storefront-sdk.

## Features

- 🎨 Modern, clean design with gradient hero section
- 📱 Fully responsive layout
- 🛒 Shopping cart functionality
- 💳 Product catalog with images and descriptions
- ⚡ Built with Next.js 14+ App Router
- 🎯 TypeScript for type safety
- 🔧 Easy to customize

## Technologies

- **Next.js** - React framework
- **TypeScript** - Type safety
- **@koraa/storefront-sdk** - Koraa storefront integration
- **CSS Modules** - Scoped styling

## Template Structure

```
demo-electronics-store/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout
│   │   └── page.tsx         # Homepage with store data
│   ├── components/
│   │   ├── StoreProvider.tsx    # Store context & cart logic
│   │   ├── Header.tsx           # Navigation header
│   │   ├── Hero.tsx             # Hero section
│   │   ├── ProductGrid.tsx      # Product listing
│   │   └── Footer.tsx           # Site footer
│   └── styles/
│       └── globals.css          # Global styles
├── next.config.js
├── tsconfig.json
└── package.json
```

## Customization

### Colors
Edit CSS variables in `src/styles/globals.css`:
- `--primary`: Main brand color
- `--secondary`: Secondary color
- `--background`: Page background
- `--surface`: Card/surface background

### Store Data
Update store information in `src/app/page.tsx`:
- Store name, description
- Logo and branding
- Currency settings

### Products
Modify the `mockProducts` array in `src/app/page.tsx` or integrate with the Koraa API.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to Koraa

This template is ready to be uploaded to the Koraa marketplace as a storefront template.

---

**Built with ❤️ for the Koraa ecosystem**

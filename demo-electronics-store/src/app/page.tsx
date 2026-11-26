'use client'

import { StoreProvider } from '@/components/StoreProvider'
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import ProductGrid from '@/components/ProductGrid'
import Footer from '@/components/Footer'
import type { Store, Product } from '@koraa/storefront-sdk'
import '../styles/globals.css'

// Mock store data for demo purposes
const mockStore: Store = {
  id: 'demo-electronics-store',
  name: 'Electronics Store Pro',
  slug: 'electronics-store-pro',
  description: 'Your one-stop shop for the latest electronics, smartphones, laptops, and tech accessories.',
  logo: '',
  primary_color: '#2563eb',
  secondary_color: '#64748b',
  currency: 'XAF',
  domain: 'electronics-store-pro.koraa.cm'
}

// Mock products for demo purposes
const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Wireless Bluetooth Headphones',
    description: 'Premium noise-cancelling headphones with 30-hour battery life and superior sound quality.',
    price: 45000,
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'],
    stock: 25,
    category: 'Audio',
    is_available: true
  },
  {
    id: '2',
    name: 'Smart Watch Pro',
    description: 'Advanced fitness tracking, heart rate monitor, and smartphone notifications on your wrist.',
    price: 85000,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'],
    stock: 15,
    category: 'Wearables',
    is_available: true
  },
  {
    id: '3',
    name: 'Ultra HD Webcam',
    description: '4K webcam with auto-focus and built-in microphone, perfect for streaming and video calls.',
    price: 32000,
    images: ['https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800'],
    stock: 40,
    category: 'Accessories',
    is_available: true
  },
  {
    id: '4',
    name: 'Portable Power Bank 20000mAh',
    description: 'High-capacity power bank with fast charging and dual USB ports.',
    price: 18000,
    images: ['https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800'],
    stock: 60,
    category: 'Accessories',
    is_available: true
  },
  {
    id: '5',
    name: 'Mechanical Gaming Keyboard',
    description: 'RGB backlit mechanical keyboard with custom switches and programmable keys.',
    price: 55000,
    images: ['https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800'],
    stock: 20,
    category: 'Gaming',
    is_available: true
  },
  {
    id: '6',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse with precision tracking and long battery life.',
    price: 12000,
    images: ['https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800'],
    stock: 50,
    category: 'Accessories',
    is_available: true
  }
]

export default function HomePage() {
  return (
    <StoreProvider store={mockStore} products={mockProducts}>
      <Header />
      <main>
        <Hero />
        <ProductGrid />
      </main>
      <Footer />
    </StoreProvider>
  )
}

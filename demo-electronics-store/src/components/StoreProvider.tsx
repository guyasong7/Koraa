'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import type { Store, Product, CartItem } from '@koraa/storefront-sdk'

interface StoreContextType {
  store: Store
  products: Product[]
  cart: CartItem[]
  addToCart: (productId: string, quantity: number) => void
  removeFromCart: (productId: string) => void
  updateCartQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  getCartTotal: () => number
  getCartCount: () => number
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore must be used within StoreProvider')
  }
  return context
}

interface StoreProviderProps {
  children: ReactNode
  store: Store
  products: Product[]
}

export function StoreProvider({ children, store, products }: StoreProviderProps) {
  const [cart, setCart] = useState<CartItem[]>([])

  const addToCart = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === productId)
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prevCart, { product, quantity }]
    })
  }

  const removeFromCart = (productId: string) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId))
  }

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    setCart(prevCart =>
      prevCart.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    )
  }

  const clearCart = () => {
    setCart([])
  }

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.product.price * item.quantity, 0)
  }

  const getCartCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0)
  }

  return (
    <StoreContext.Provider
      value={{
        store,
        products,
        cart,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        getCartTotal,
        getCartCount,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

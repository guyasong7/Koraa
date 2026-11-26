/**
 * React hooks for Koraa storefront templates.
 */

"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { Store, Product, CartItem, TemplateContext } from "./index";

const KoraaContext = createContext<TemplateContext | null>(null);

export interface KoraaProviderProps {
  store: Store;
  products: Product[];
  children: ReactNode;
}

/**
 * Provider for Koraa template context.
 */
export function KoraaProvider({ store, products, children }: KoraaProviderProps) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setCart(prev => {
      const existing = prev.find(item => item.product.id === productId);
      if (existing) {
        return prev.map(item =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
  }, [products]);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const value: TemplateContext = {
    store,
    products,
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
  };

  return <KoraaContext.Provider value={value}>{children}</KoraaContext.Provider>;
}

/**
 * Hook to access store data.
 */
export function useKoraaStore(): Store {
  const context = useContext(KoraaContext);
  if (!context) {
    throw new Error("useKoraaStore must be used within KoraaProvider");
  }
  return context.store;
}

/**
 * Hook to access products.
 */
export function useKoraaProducts(): Product[] {
  const context = useContext(KoraaContext);
  if (!context) {
    throw new Error("useKoraaProducts must be used within KoraaProvider");
  }
  return context.products;
}

/**
 * Hook to access cart.
 */
export function useKoraaCart() {
  const context = useContext(KoraaContext);
  if (!context) {
    throw new Error("useKoraaCart must be used within KoraaProvider");
  }
  return {
    cart: context.cart,
    addToCart: context.addToCart,
    removeFromCart: context.removeFromCart,
    updateCartQuantity: context.updateCartQuantity,
    clearCart: context.clearCart,
  };
}

/**
 * Hook to access entire template context.
 */
export function useKoraa(): TemplateContext {
  const context = useContext(KoraaContext);
  if (!context) {
    throw new Error("useKoraa must be used within KoraaProvider");
  }
  return context;
}

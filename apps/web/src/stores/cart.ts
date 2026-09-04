import { create } from "zustand";
import { persist } from "zustand/middleware";
import { StorefrontProduct } from "@/types/storefront";

export interface CartItem {
  product: StorefrontProduct;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  /** Drawer visibility. Deliberately not persisted — see `partialize` below. */
  isOpen: boolean;
  addItem: (product: StorefrontProduct) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      // Adding opens the drawer, so the shopper sees the line land instead of
      // guessing whether the tap registered.
      addItem: (product) => {
        set((state) => {
          const existing = state.items.find((i) => i.product.id === product.id);
          if (existing) {
            return {
              isOpen: true,
              items: state.items.map((i) =>
                i.product.id === product.id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            };
          }
          return { isOpen: true, items: [...state.items, { product, quantity: 1 }] };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.id !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId ? { ...i, quantity: Math.max(1, quantity) } : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      getCartTotal: () => {
        return get().items.reduce((total, item) => {
          return total + (parseFloat(item.product.base_price) * item.quantity);
        }, 0);
      },

      getCartCount: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      }
    }),
    {
      name: "koraa-cart",
      // Only the basket survives a reload. Persisting `isOpen` would pop the
      // drawer open on every fresh page load.
      partialize: (state) => ({ items: state.items }),
    }
  )
);

/*
 * Read the cart through these, never through `useCartStore(s => s.getCartCount)`.
 *
 * Selecting the *method* hands back a referentially stable function, so the
 * component never re-subscribes to `items` and its badge sits at whatever it
 * rendered first. Selecting the derived number subscribes to the data, so the
 * count updates the moment something is added. This was the "add to cart is
 * lagging" bug: nothing was slow, the navbar simply never re-rendered.
 */
export function useCartCount(): number {
  return useCartStore((state) =>
    state.items.reduce((total, item) => total + item.quantity, 0)
  );
}

export function useCartTotal(): number {
  return useCartStore((state) =>
    state.items.reduce(
      (total, item) => total + parseFloat(item.product.base_price) * item.quantity,
      0
    )
  );
}

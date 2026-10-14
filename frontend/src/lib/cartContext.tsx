'use client';

/**
 * cartContext.tsx
 *
 * WHAT IS REACT CONTEXT?
 * Imagine you have a user's cart. The product catalog page needs to ADD to it.
 * The cart page needs to READ from it. The checkout page needs to CLEAR it.
 * These are 3 different pages with no direct parent-child relationship.
 *
 * Without Context: you'd have to pass the cart as a prop through every
 * intermediate component (called "prop drilling") — ugly and unscalable.
 *
 * With Context: you create one shared "bucket" of state that any component
 * in the app can access directly. This is the Context pattern.
 *
 * HOW IT WORKS:
 * 1. createContext() — defines the shape of the shared state
 * 2. Provider — wraps your app and "provides" the state to children
 * 3. useContext() — any child component calls this hook to read/write the state
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

// The shape of a single item in the cart
export interface CartItem {
  productId: string;
  quantity: number;
}

// The shape of the entire cart context value
// We define this interface so TypeScript can catch mistakes at compile time
interface CartContextType {
  items: CartItem[];
  addItem: (productId: string, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
}

// Step 1: Create the context with a default value
// The default value is used when a component is rendered outside of a Provider
const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  totalItems: 0,
});

// Step 2: Create the Provider component
// This wraps our store pages and keeps the cart state alive
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // useCallback prevents functions from being recreated on every render
  // This is a performance optimization — important to know for interviews
  const addItem = useCallback((productId: string, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        // Product already in cart — just increment quantity
        return prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      // New product — append to cart
      return [...prev, { productId, quantity }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  // Derived state: total item count shown on the cart badge
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems }}>
      {children}
    </CartContext.Provider>
  );
}

// Step 3: Export a custom hook for consuming the context
// This is a convenience wrapper that avoids writing useContext(CartContext) everywhere
// It also adds a safety check that the hook is used inside a Provider
export function useCart(): CartContextType {
  const context = useContext(CartContext);
  return context;
}

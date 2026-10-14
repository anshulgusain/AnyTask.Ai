'use client';

/**
 * CartBadge.tsx
 *
 * WHY IS THIS A SEPARATE FILE?
 * Next.js App Router has two types of components:
 *
 * 1. SERVER COMPONENTS (default): Run on the server, can fetch data from DB,
 *    cannot use React hooks (useState, useContext, etc.)
 *
 * 2. CLIENT COMPONENTS ('use client'): Run in the browser, can use all React
 *    hooks, can access browser APIs (localStorage, window, etc.)
 *
 * Our layout.tsx is a SERVER component — it renders once on the server
 * and sends HTML to the browser. But reading the cart requires useCart()
 * (a React hook using useContext) which ONLY works in client components.
 *
 * Solution: Extract just the badge into a tiny CLIENT component.
 * The layout stays as a server component for performance,
 * and only the badge is client-side and reactive.
 *
 * This is a very common real-world Next.js pattern.
 */

import { useCart } from '@/lib/cartContext';

export default function CartBadge() {
  const { totalItems } = useCart();

  if (totalItems === 0) return null;

  return (
    <span
      id="cart-badge"
      style={{
        background: '#6366f1',
        color: 'white',
        fontSize: '0.65rem',
        fontWeight: 700,
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {totalItems}
    </span>
  );
}

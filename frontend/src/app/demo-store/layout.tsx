/**
 * demo-store/layout.tsx
 *
 * WHY A NESTED LAYOUT?
 * Next.js App Router uses a file-based layout system.
 * Any layout.tsx file wraps ALL pages inside the same folder.
 *
 * So this layout.tsx wraps:
 * - /demo-store          (page.tsx — product catalog)
 * - /demo-store/cart     (cart/page.tsx)
 * - /demo-store/checkout (checkout/page.tsx)
 * - /demo-store/confirmation (confirmation/page.tsx)
 *
 * This means the NavBar and CartProvider only need to be defined ONCE
 * and they automatically appear/exist on every store page.
 *
 * The CartProvider wraps here so that cart state persists when the user
 * navigates between the store pages (from catalog → cart → checkout).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { CartProvider } from '@/lib/cartContext';
import CartBadge from './CartBadge';

export const metadata: Metadata = {
  title: 'DevStore — AnyTask.AI E2E Test Playground',
  description:
    'A realistic multi-step e-commerce store built to demonstrate autonomous AI browser testing with AnyTask.AI.',
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div style={{ minHeight: '100vh', background: '#080b14', color: '#f8fafc', fontFamily: 'sans-serif' }}>
        {/* Store Navigation Bar */}
        <header style={{
          background: 'rgba(12, 16, 28, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 1.5rem',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            {/* Brand */}
            <Link href="/demo-store" style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  background: 'linear-gradient(90deg, #818cf8, #38bdf8)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>DevStore</span>
                <span style={{
                  fontSize: '0.65rem',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  padding: '0.1rem 0.5rem',
                  borderRadius: '999px',
                  fontWeight: 600,
                }}>AI TEST TARGET</span>
              </div>
            </Link>

            {/* Nav Links — important! These give the agent navigation anchors to discover */}
            <nav id="store-nav" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <Link id="nav-catalog" href="/demo-store"
                style={{ fontSize: '0.88rem', color: '#94a3b8', textDecoration: 'none', fontWeight: 500 }}>
                Catalog
              </Link>
              <Link id="nav-cart" href="/demo-store/cart"
                style={{ fontSize: '0.88rem', color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
                Cart <CartBadge />
              </Link>
            </nav>
          </div>
        </header>

        {/* Page content rendered here by Next.js */}
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
          {children}
        </main>

        {/* Footer — gives the agent a clear boundary that the page has ended */}
        <footer style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '1.5rem',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: '#475569',
          marginTop: '3rem',
        }}>
          DevStore is a simulated e-commerce app for AnyTask.AI autonomous QA testing. No real transactions occur.
        </footer>
      </div>
    </CartProvider>
  );
}

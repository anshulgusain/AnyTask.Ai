'use client';

/**
 * demo-store/page.tsx — Product Catalog
 *
 * This is the entry point of the demo store. The AI agent will land here first
 * when given the URL http://localhost:3000/demo-store.
 *
 * KEY DESIGN DECISIONS FOR AGENT COMPATIBILITY:
 *
 * 1. Semantic IDs on every interactive element:
 *    - Each product card has: data-product-id="prod_001"
 *    - Each add-to-cart button has: id="add-to-cart-prod_001"
 *    This lets the agent target elements reliably using CSS attribute selectors.
 *
 * 2. Visible, readable text labels:
 *    Price, name, and category are always rendered as visible text, never hidden
 *    in CSS or loaded via lazy async calls. This ensures the agent can extract
 *    them with page.textContent() immediately after page load.
 *
 * 3. Clear navigation paths:
 *    The "View Cart" button and nav links give the agent explicit routes to follow
 *    after adding an item to the cart.
 */

import { useState } from 'react';
import Link from 'next/link';
import { PRODUCTS, formatPrice } from '@/lib/products';
import { useCart } from '@/lib/cartContext';

export default function CatalogPage() {
  const { addItem, totalItems } = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);

  // Visual feedback: briefly show "Added!" on the button after clicking
  const handleAddToCart = (productId: string) => {
    addItem(productId, 1);
    setAddedId(productId);
    setTimeout(() => setAddedId(null), 1200);
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 id="catalog-title" style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>
          Developer Hardware Catalog
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          {PRODUCTS.filter((p) => p.inStock).length} products available — select items to add to your cart.
        </p>
      </div>

      {/* Cart Summary Banner — visible when items exist */}
      {totalItems > 0 && (
        <div id="cart-summary-banner" style={{
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '12px',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: '#a5b4fc', fontWeight: 600, fontSize: '0.9rem' }}>
            {totalItems} item{totalItems === 1 ? '' : 's'} in your cart
          </span>
          <Link id="go-to-cart-btn" href="/demo-store/cart" style={{
            background: '#6366f1',
            color: 'white',
            padding: '0.45rem 1rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}>
            View Cart →
          </Link>
        </div>
      )}

      {/* Product Grid */}
      <div id="product-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1.25rem',
      }}>
        {PRODUCTS.map((product) => (
          <div
            key={product.id}
            id={`product-card-${product.id}`}
            data-product-id={product.id}
            data-in-stock={product.inStock}
            style={{
              background: 'rgba(18, 22, 36, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              padding: '1.4rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              opacity: product.inStock ? 1 : 0.55,
            }}
          >
            {/* Category badge */}
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: '#7dd3fc',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              alignSelf: 'flex-start',
            }}>
              {product.category}
            </span>

            {/* Product Name */}
            <h2
              id={`product-name-${product.id}`}
              style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}
            >
              {product.name}
            </h2>

            {/* Description */}
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              {product.description}
            </p>

            {/* Price + Stock */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <span
                id={`product-price-${product.id}`}
                style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}
              >
                {formatPrice(product.price)}
              </span>
              {!product.inStock && (
                <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600 }}>Out of Stock</span>
              )}
            </div>

            {/* Add to Cart Button */}
            <button
              id={`add-to-cart-${product.id}`}
              disabled={!product.inStock}
              onClick={() => handleAddToCart(product.id)}
              style={{
                background: addedId === product.id
                  ? 'rgba(16, 185, 129, 0.2)'
                  : product.inStock
                    ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                    : 'rgba(255, 255, 255, 0.06)',
                color: addedId === product.id ? '#34d399' : 'white',
                border: addedId === product.id ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
                padding: '0.7rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: product.inStock ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
              }}
            >
              {addedId === product.id ? '✓ Added to Cart!' : product.inStock ? 'Add to Cart' : 'Unavailable'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

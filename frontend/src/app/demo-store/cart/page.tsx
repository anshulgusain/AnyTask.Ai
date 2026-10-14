'use client';

/**
 * demo-store/cart/page.tsx — Cart Review Screen
 *
 * WHAT THIS TEACHES:
 * This page demonstrates reading from shared state (CartContext), computing
 * derived values (totals), and conditional rendering (empty state vs. items).
 *
 * FOR THE AGENT:
 * - id="cart-items-list" — the agent asserts this exists and is non-empty
 * - id="cart-total" — the agent reads the total and logs it for the test report
 * - id="proceed-to-checkout-btn" — the agent clicks this to advance the journey
 * - id="empty-cart-message" — if the agent sees this, it knows the cart add step failed
 */

import Link from 'next/link';
import { useCart } from '@/lib/cartContext';
import { getProductById, formatPrice } from '@/lib/products';

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalItems } = useCart();

  // Derived state: compute the order total from cart items + product prices
  // This is a common pattern — the cart only stores IDs and quantities,
  // not prices. Prices always come from the source of truth (products.ts)
  // to avoid price manipulation attacks in real e-commerce apps.
  const orderTotal = items.reduce((sum, item) => {
    const product = getProductById(item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  const isEmpty = items.length === 0;

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <h1 id="cart-page-title" style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '1.5rem' }}>
        Your Cart
      </h1>

      {/* EMPTY STATE — agent checks for this to verify add-to-cart step succeeded */}
      {isEmpty ? (
        <div id="empty-cart-message" style={{
          background: 'rgba(18, 22, 36, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '3rem',
          textAlign: 'center',
        }}>
          <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '1.25rem' }}>
            Your cart is empty. Browse products to get started.
          </p>
          <Link id="back-to-catalog-btn" href="/demo-store" style={{
            background: '#6366f1',
            color: 'white',
            padding: '0.65rem 1.25rem',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}>
            Browse Catalog
          </Link>
        </div>
      ) : (
        <>
          {/* Cart Items List */}
          <div id="cart-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {items.map((item) => {
              const product = getProductById(item.productId);
              if (!product) return null;
              return (
                <div
                  key={item.productId}
                  id={`cart-item-${item.productId}`}
                  style={{
                    background: 'rgba(18, 22, 36, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p id={`cart-item-name-${item.productId}`} style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                      {product.name}
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{formatPrice(product.price)} each</p>
                  </div>

                  {/* Quantity Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      id={`decrease-qty-${item.productId}`}
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                    >−</button>
                    <span id={`item-qty-${item.productId}`} style={{ minWidth: '24px', textAlign: 'center', fontWeight: 700 }}>
                      {item.quantity}
                    </span>
                    <button
                      id={`increase-qty-${item.productId}`}
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                    >+</button>
                  </div>

                  {/* Item Subtotal */}
                  <span id={`cart-item-subtotal-${item.productId}`} style={{ fontWeight: 700, minWidth: '70px', textAlign: 'right' }}>
                    {formatPrice(product.price * item.quantity)}
                  </span>

                  {/* Remove */}
                  <button
                    id={`remove-item-${item.productId}`}
                    onClick={() => removeItem(item.productId)}
                    style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244,63,94,0.25)', color: '#fb7185', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          {/* Order Summary */}
          <div style={{
            background: 'rgba(18, 22, 36, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.88rem', color: '#94a3b8' }}>
              <span>Items ({totalItems})</span>
              <span>{formatPrice(orderTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.88rem', color: '#94a3b8' }}>
              <span>Shipping</span>
              <span style={{ color: '#34d399' }}>Free</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', fontWeight: 800, fontSize: '1.1rem' }}>
              <span>Total</span>
              <span id="cart-total">{formatPrice(orderTotal)}</span>
            </div>

            <Link
              id="proceed-to-checkout-btn"
              href="/demo-store/checkout"
              style={{
                display: 'block',
                marginTop: '1.25rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: 'white',
                padding: '0.9rem',
                borderRadius: '10px',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                textAlign: 'center',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
              }}
            >
              Proceed to Checkout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

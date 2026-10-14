'use client';

/**
 * demo-store/checkout/page.tsx — Checkout Form
 *
 * WHAT THIS TEACHES:
 * Controlled form inputs with React useState — the most common form pattern.
 * Each input's value is bound to state and updated via onChange handlers.
 * This is called a "controlled component" because React controls the input value.
 *
 * FOR THE AGENT (Day 3):
 * The agent will navigate here from the cart, then:
 * 1. Fill shipping fields: #shipping-name, #shipping-address, #shipping-city, #shipping-zip
 * 2. Fill payment fields: #card-number, #card-expiry, #card-cvv
 * 3. PAUSE here (Human-in-the-Loop mode) and stream a screenshot asking for approval
 * 4. On approval, click #place-order-btn to complete the purchase
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cartContext';
import { getProductById, formatPrice } from '@/lib/products';

interface CheckoutForm {
  // Shipping
  fullName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  // Payment (test credentials only)
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  cardName: string;
}

const INITIAL_FORM: CheckoutForm = {
  fullName: '', address: '', city: '', state: '', zip: '',
  cardNumber: '', cardExpiry: '', cardCvv: '', cardName: '',
};

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart } = useCart();
  const [form, setForm] = useState<CheckoutForm>(INITIAL_FORM);
  const [isProcessing, setIsProcessing] = useState(false);

  const orderTotal = items.reduce((sum, item) => {
    const product = getProductById(item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  // Generic change handler — avoids writing a handler for every field
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    // Simulate a 1.5s payment processing delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    clearCart();
    // Navigate to the confirmation page with a randomly generated order ID
    const orderId = `ORD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    router.push(`/demo-store/confirmation?orderId=${orderId}&total=${orderTotal}`);
  };

  const inputStyle = {
    width: '100%',
    padding: '0.7rem 0.9rem',
    background: '#090c15',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: 'white',
    fontSize: '0.88rem',
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.35rem',
  };

  const sectionStyle = {
    background: 'rgba(18, 22, 36, 0.8)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '1.5rem',
    marginBottom: '1.25rem',
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <h1 id="checkout-title" style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '1.5rem' }}>
        Checkout
      </h1>

      <form id="checkout-form" onSubmit={handlePlaceOrder} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* LEFT COLUMN: Shipping + Payment */}
        <div>
          {/* Shipping Section */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Shipping Information</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label htmlFor="fullName" style={labelStyle}>Full Name</label>
                <input id="fullName" name="fullName" type="text" required placeholder="Jane Doe"
                  value={form.fullName} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="address" style={labelStyle}>Street Address</label>
                <input id="address" name="address" type="text" required placeholder="123 Dev Lane"
                  value={form.address} onChange={handleChange} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label htmlFor="city" style={labelStyle}>City</label>
                  <input id="city" name="city" type="text" required placeholder="San Francisco"
                    value={form.city} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="zip" style={labelStyle}>ZIP Code</label>
                  <input id="zip" name="zip" type="text" required placeholder="94102" maxLength={10}
                    value={form.zip} onChange={handleChange} style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Section */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem' }}>Payment Details</h2>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
              Test environment — no real charges. Use any values.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label htmlFor="cardName" style={labelStyle}>Name on Card</label>
                <input id="cardName" name="cardName" type="text" required placeholder="Jane Doe"
                  value={form.cardName} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="cardNumber" style={labelStyle}>Card Number</label>
                <input id="cardNumber" name="cardNumber" type="text" required placeholder="4242 4242 4242 4242"
                  maxLength={19} value={form.cardNumber} onChange={handleChange} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label htmlFor="cardExpiry" style={labelStyle}>Expiry</label>
                  <input id="cardExpiry" name="cardExpiry" type="text" required placeholder="MM/YY"
                    maxLength={5} value={form.cardExpiry} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="cardCvv" style={labelStyle}>CVV</label>
                  <input id="cardCvv" name="cardCvv" type="text" required placeholder="123"
                    maxLength={4} value={form.cardCvv} onChange={handleChange} style={inputStyle} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Order Summary */}
        <div>
          <div style={{ ...sectionStyle, position: 'sticky', top: '80px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Order Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
              {items.map((item) => {
                const product = getProductById(item.productId);
                if (!product) return null;
                return (
                  <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#94a3b8' }}>{product.name} × {item.quantity}</span>
                    <span>{formatPrice(product.price * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem' }}>
              <span>Total</span>
              <span id="checkout-total">{formatPrice(orderTotal)}</span>
            </div>

            <button
              id="place-order-btn"
              type="submit"
              disabled={isProcessing || items.length === 0}
              style={{
                marginTop: '1.25rem',
                width: '100%',
                background: isProcessing ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: 'white',
                border: 'none',
                padding: '0.9rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: isProcessing ? 'wait' : 'pointer',
                boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
              }}
            >
              {isProcessing ? 'Processing Payment...' : `Place Order · ${formatPrice(orderTotal)}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

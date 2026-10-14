'use client';

/**
 * demo-store/confirmation/page.tsx — Order Confirmation Screen
 *
 * WHAT THIS TEACHES:
 * Reading URL query parameters using useSearchParams() from next/navigation.
 * The checkout page passes ?orderId=...&total=... in the URL so this page
 * can display the order details without needing a database.
 *
 * WHY QUERY PARAMS INSTEAD OF GLOBAL STATE?
 * If the user refreshes this page, React state (from Context or useState) is lost.
 * But URL query params survive a refresh — they're part of the URL.
 * For a real app you'd fetch from a database. For learning, URL params are perfect.
 *
 * FOR THE AGENT (Day 3-4):
 * This is the FINAL ASSERTION point in the test journey.
 * The agent will:
 * 1. Assert that id="order-confirmation-banner" exists on the page
 * 2. Read id="order-id-display" and log the value in the test report
 * 3. Mark the full E2E test as PASSED if this screen is reached
 * 4. Take a final screenshot as visual proof of the completed order
 */

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || 'ORD-UNKNOWN';
  const total = parseInt(searchParams.get('total') || '0', 10);
  const formattedTotal = `$${(total / 100).toFixed(2)}`;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ maxWidth: '580px', margin: '0 auto', textAlign: 'center' }}>
      {/* Success Banner — the agent asserts this element exists to PASS the test */}
      <div
        id="order-confirmation-banner"
        style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '20px',
          padding: '3rem 2rem',
        }}
      >
        {/* Check icon */}
        <div style={{
          width: '64px',
          height: '64px',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '2px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
          fontSize: '1.8rem',
        }}>✓</div>

        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399', marginBottom: '0.5rem' }}>
          Order Placed Successfully!
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Your order has been confirmed and is being processed.
        </p>

        {/* Order Details — the agent reads these to generate the test report */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          textAlign: 'left',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.88rem' }}>
            <span style={{ color: '#64748b' }}>Order ID</span>
            <span id="order-id-display" style={{ fontWeight: 700, fontFamily: 'monospace', color: '#f8fafc' }}>
              {orderId}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.88rem' }}>
            <span style={{ color: '#64748b' }}>Order Date</span>
            <span id="order-date-display" style={{ fontWeight: 600, color: '#f8fafc' }}>{date}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: '#64748b', fontWeight: 700 }}>Total Charged</span>
            <span id="order-total-display" style={{ fontWeight: 800, fontSize: '1rem', color: '#34d399' }}>
              {formattedTotal}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '1.5rem' }}>
          Note: This is a simulated order on a test environment. No real payment was processed.
        </p>

        <Link
          id="back-to-store-btn"
          href="/demo-store"
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          ← Back to Store
        </Link>
      </div>
    </div>
  );
}

// Suspense wrapper is required by Next.js when using useSearchParams() in a page
// because the query string is only available on the client, not during server rendering
export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>Loading order details...</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}

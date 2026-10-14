'use client';

import { useState } from 'react';

export default function DemoFormPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    subject: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#0a0d14',
      color: '#f8fafc',
      fontFamily: 'sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: '#121726',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            background: 'rgba(99, 102, 241, 0.15)',
            color: '#818cf8',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontWeight: 600,
          }}>
            LOCAL TEST ENVIRONMENT
          </span>
          <h1 style={{ fontSize: '1.5rem', marginTop: '0.75rem', fontWeight: 700 }}>
            Contact & Inquiry Form
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            A standard target form designed for testing AI browser automation and Playwright.
          </p>
        </div>

        {submitted ? (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <h3 style={{ color: '#34d399', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              ✓ Form Successfully Submitted!
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Received submission for: <strong>{formData.fullName || 'Anonymous'}</strong> ({formData.email})
            </p>
            <button
              onClick={() => setSubmitted(false)}
              style={{
                background: '#6366f1',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Reset Form
            </button>
          </div>
        ) : (
          <form id="contact-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label htmlFor="fullName" style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600 }}>
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="e.g. Jane Doe"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: '#090c15',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600 }}>
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: '#090c15',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label htmlFor="subject" style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600 }}>
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                placeholder="Inquiry about services"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: '#090c15',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label htmlFor="message" style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 600 }}>
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                placeholder="Type your message here..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: '#090c15',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              id="submit-button"
              type="submit"
              style={{
                marginTop: '0.5rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: 'white',
                border: 'none',
                padding: '0.85rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
              }}
            >
              Submit Contact Form
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

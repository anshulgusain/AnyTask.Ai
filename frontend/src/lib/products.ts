/**
 * products.ts
 *
 * This file is the single source of truth for all products in the demo store.
 *
 * Why a separate file? Because both the catalog page (/demo-store) and the
 * cart page (/demo-store/cart) need to know what products exist and their
 * prices. If you hardcode data in two places and the price changes, you have a
 * bug. One source of truth prevents that.
 *
 * The agent will read the product IDs from the DOM and use this file's
 * structure to correlate what it sees on screen with the actual data.
 */

export interface Product {
  id: string;
  name: string;
  price: number;       // Always store price in cents to avoid floating-point bugs
  description: string;
  category: string;
  inStock: boolean;
}

export const PRODUCTS: Product[] = [
  {
    id: 'prod_001',
    name: 'Mechanical Keyboard Pro',
    price: 12999,
    description: 'Tactile 87-key TKL keyboard with RGB backlight and Cherry MX switches.',
    category: 'Peripherals',
    inStock: true,
  },
  {
    id: 'prod_002',
    name: 'Noise-Cancelling Headphones',
    price: 24999,
    description: 'Over-ear ANC headphones with 30-hour battery and premium audio drivers.',
    category: 'Audio',
    inStock: true,
  },
  {
    id: 'prod_003',
    name: '4K Curved Monitor',
    price: 54999,
    description: '32-inch 4K UHD curved display, 144Hz refresh rate, HDR600.',
    category: 'Displays',
    inStock: true,
  },
  {
    id: 'prod_004',
    name: 'Wireless Ergonomic Mouse',
    price: 7999,
    description: 'Sculpted ergonomic design with 90-day battery life and silent clicks.',
    category: 'Peripherals',
    inStock: true,
  },
  {
    id: 'prod_005',
    name: 'USB-C Hub 8-in-1',
    price: 4999,
    description: 'Expand your MacBook or laptop with HDMI 4K, 3x USB-A, SD card reader.',
    category: 'Accessories',
    inStock: false,
  },
  {
    id: 'prod_006',
    name: 'Developer Desk Lamp',
    price: 3999,
    description: 'LED desk lamp with adjustable color temperature and wireless charging base.',
    category: 'Accessories',
    inStock: true,
  },
];

/**
 * Helper to format price from cents to a human-readable currency string.
 * e.g. 12999 → "$129.99"
 *
 * Why cents? JavaScript floating-point math is famously unreliable.
 * 0.1 + 0.2 === 0.30000000000000004 in JS. Storing prices as integers avoids this entirely.
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Look up a single product by its ID.
 * The cart only stores product IDs + quantity, so we need this to display details.
 */
export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

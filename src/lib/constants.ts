import type { Product } from '../state/types';

export const CATEGORIES = ['All', 'Food', 'Drink', 'Snack', 'Other'] as const;
export const PRODUCT_CATEGORIES = CATEGORIES.filter((c) => c !== 'All');
export const UNITS = ['pcs', 'pack', 'kg', 'gram', 'liter', 'ml'];
export const BIZ_TYPES = ['Coffee Shop', 'Restaurant', 'Mini Mart', 'Bakery', 'Food Stall', 'Other'];
export const LOGO_PRESETS = ['☕', '🍜', '🏪', '🍰', '🍞', '🍱', '🧋', '🛒'];
export const PHOTO_PRESETS = [
  { label: 'Coffee', emoji: '☕' },
  { label: 'Tea', emoji: '🍵' },
  { label: 'Juice', emoji: '🧃' },
  { label: 'Soda', emoji: '🥤' },
  { label: 'Pastry', emoji: '🥐' },
  { label: 'Bread', emoji: '🍞' },
  { label: 'Bowl', emoji: '🍜' },
  { label: 'Fried', emoji: '🍛' },
  { label: 'Salad', emoji: '🥗' },
  { label: 'Cake', emoji: '🍰' },
  { label: 'Snack', emoji: '🍪' },
  { label: 'Water', emoji: '💧' },
];
export const SORTS = [
  { id: 'name', label: 'Name A–Z' },
  { id: 'newest', label: 'Newest first' },
  { id: 'priceAsc', label: 'Price: Low → High' },
  { id: 'priceDesc', label: 'Price: High → Low' },
  { id: 'stockAsc', label: 'Stock: Low → High' },
] as const;
export const STOCK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'In Stock' },
  { id: 'low', label: 'Low Stock' },
  { id: 'out', label: 'Out of Stock' },
] as const;

export type SortId = (typeof SORTS)[number]['id'];
export type StockFilterId = (typeof STOCK_FILTERS)[number]['id'];
export type Category = (typeof CATEGORIES)[number];

interface DemoProduct {
  name: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
  photoUrl: string;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  { name: 'Kopi Susu Gula Aren', category: 'Drink', price: 18000, stock: 32, unit: 'pcs', photoUrl: '☕' },
  { name: 'Espresso', category: 'Drink', price: 15000, stock: 24, unit: 'pcs', photoUrl: '☕' },
  { name: 'Matcha Latte', category: 'Drink', price: 22000, stock: 16, unit: 'pcs', photoUrl: '🍵' },
  { name: 'Es Teh Jumbo', category: 'Drink', price: 8000, stock: 40, unit: 'pcs', photoUrl: '🥤' },
  { name: 'Air Mineral 600ml', category: 'Drink', price: 4000, stock: 48, unit: 'ml', photoUrl: '💧' },
  { name: 'Roti Bakar Coklat', category: 'Food', price: 10000, stock: 14, unit: 'pcs', photoUrl: '🍞' },
  { name: 'Mie Ayam Bakso', category: 'Food', price: 15000, stock: 18, unit: 'pcs', photoUrl: '🍜' },
  { name: 'Nasi Goreng Kampung', category: 'Food', price: 20000, stock: 10, unit: 'pcs', photoUrl: '🍛' },
  { name: 'Croissant Butter', category: 'Snack', price: 15000, stock: 3, unit: 'pcs', photoUrl: '🥐' },
  { name: 'Biskuit Kacang', category: 'Snack', price: 6000, stock: 0, unit: 'pack', photoUrl: '🍪' },
  { name: 'Keripik Pedas', category: 'Snack', price: 9000, stock: 4, unit: 'pack', photoUrl: '🥔' },
  { name: 'Kotak Tissue', category: 'Other', price: 12000, stock: 9, unit: 'pcs', photoUrl: '🧻' },
];

export const seedProducts = (): Product[] =>
  DEMO_PRODUCTS.map((p, i) => ({
    ...p,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + i,
    createdAt: Date.now() - i * 36e5,
  }));

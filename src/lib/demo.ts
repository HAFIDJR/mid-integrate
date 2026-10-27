import type { Product, Sale, SaleItem } from '../state/types';
import { DEMO_PRODUCTS } from './constants';
import { addDays, uid } from './format';

const CUSTOMER_NAMES = [
  'Andi',
  'Siti',
  'Rizky',
  'Dewi',
  'Budi',
  'Lia',
  'Fajar',
  'Maya',
  'Raka',
  'Tari',
  'Yoga',
  'Nadia',
];

/** Port of the vanilla demo generator: 12 products + ~30 days of transactions. */
export function generateDemo(): { products: Product[]; sales: Sale[] } {
  const products: Product[] = DEMO_PRODUCTS.map((product, index) => ({
    ...product,
    id: uid() + 'd' + index,
    createdAt: Date.now() - index * 36e5,
  }));
  const sales: Sale[] = [];
  let counter = 0;

  for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
    const day = addDays(new Date(), -dayOffset);
    const count = 2 + Math.floor(Math.random() * 6);
    for (let k = 0; k < count; k += 1) {
      const date = new Date(day);
      date.setHours(8 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60), 0, 0);
      if (dayOffset === 0 && date > new Date()) continue;

      const used = new Set<string>();
      const items: SaleItem[] = [];
      const picks = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < picks; j += 1) {
        const product = products[Math.floor(Math.random() * products.length)];
        if (used.has(product.id)) continue;
        used.add(product.id);
        items.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: 1 + Math.floor(Math.random() * 3),
        });
      }
      if (items.length === 0) continue;

      const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const methods: Array<'Cash' | 'QRIS' | 'Card'> = ['Cash', 'Cash', 'Cash', 'QRIS', 'QRIS', 'Card'];
      const method = methods[Math.floor(Math.random() * methods.length)];
      const cash = method === 'Cash' ? Math.ceil(total / 5000) * 5000 : total;
      counter += 1;
      const hasCustomer = Math.random() < 0.35;
      sales.push({
        id: uid() + 's' + counter,
        saleNumber: '#' + String(counter).padStart(4, '0'),
        date: date.toISOString(),
        customerName: hasCustomer
          ? CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)]
          : '',
        customerPhone: hasCustomer
          ? '081' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
          : '',
        items,
        total,
        cashReceived: cash,
        change: cash - total,
        paymentMethod: method,
        status: 'PAID',
      });
    }
  }

  return { products, sales };
}

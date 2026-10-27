import type { Product, Sale } from '../state/types';
import { addDays, dayDiff, parseLocalDate, startOfDay, WK } from './format';

export type ReportRangeId = '7d' | '30d' | 'month' | 'custom';
export type TopMode = 'units' | 'revenue';

export interface TopSeller {
  productId: string;
  name: string;
  photo: string;
  unit: string;
  units: number;
  revenue: number;
}

export function topSellers(
  sales: Sale[],
  products: Product[],
  mode: TopMode,
  limit?: number,
): TopSeller[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const totals = new Map<string, TopSeller>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const product = byId.get(item.productId);
      const current = totals.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        photo: product?.photoUrl || product?.photo || '📦',
        unit: product?.unit || 'pcs',
        units: 0,
        revenue: 0,
      };
      current.units += item.qty;
      current.revenue += item.price * item.qty;
      totals.set(item.productId, current);
    }
  }
  const sorted = [...totals.values()].sort((a, b) =>
    mode === 'units' ? b.units - a.units : b.revenue - a.revenue,
  );
  return limit ? sorted.slice(0, limit) : sorted;
}

export interface ReportRange {
  start: Date;
  end: Date;
  span: number;
}

export function rangeBounds(tab: ReportRangeId, rFrom: string, rTo: string): ReportRange {
  const now = new Date();
  const endDay = new Date(now);
  endDay.setHours(23, 59, 59, 999);
  let start: Date;
  const end: Date = endDay;
  if (tab === '7d') start = addDays(startOfDay(now), -6);
  else if (tab === '30d') start = addDays(startOfDay(now), -29);
  else if (tab === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  else {
    const from = rFrom ? parseLocalDate(rFrom) : addDays(startOfDay(now), -6);
    const to = rTo ? parseLocalDate(rTo) : now;
    to.setHours(23, 59, 59, 999);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      return { start: addDays(startOfDay(now), -6), end: endDay, span: 7 };
    }
    return { start: from, end: to, span: dayDiff(from, to) + 1 };
  }
  return { start, end, span: dayDiff(start, end) + 1 };
}

export interface ReportData extends ReportRange {
  sales: Sale[];
  rev: number;
  prevRev: number;
  growth: number | null;
  txns: number;
  units: number;
  avg: number;
}

export function computeReport(
  allSales: Sale[],
  tab: ReportRangeId,
  rFrom: string,
  rTo: string,
): ReportData {
  const { start, end, span } = rangeBounds(tab, rFrom, rTo);
  const inRange = (date: string | number | Date) => {
    const time = new Date(date).getTime();
    return time >= start.getTime() && time <= end.getTime();
  };
  const sales = allSales
    .filter((sale) => inRange(sale.date))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = addDays(start, -span);
  const prevSales = allSales.filter((sale) => {
    const time = new Date(sale.date).getTime();
    return time >= prevStart.getTime() && time <= prevEnd.getTime();
  });
  const rev = sales.reduce((total, sale) => total + sale.total, 0);
  const prevRev = prevSales.reduce((total, sale) => total + sale.total, 0);
  const growth = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : null;
  const units = sales.reduce(
    (total, sale) => total + sale.items.reduce((sum, item) => sum + item.qty, 0),
    0,
  );
  return {
    start,
    end,
    span,
    sales,
    rev,
    prevRev,
    growth,
    txns: sales.length,
    units,
    avg: sales.length ? rev / sales.length : 0,
  };
}

export interface ChartBucket {
  label: string;
  v: number;
}

export function reportBuckets(data: ReportData, tab: ReportRangeId): ChartBucket[] {
  const days = dayDiff(data.start, data.end) + 1;
  const out: ChartBucket[] = [];
  const sumFor = (a: number, b: number) =>
    data.sales.reduce((sum, sale) => {
      const time = new Date(sale.date).getTime();
      return time >= a && time <= b ? sum + sale.total : sum;
    }, 0);
  if (days <= 14) {
    for (let i = 0; i < days; i += 1) {
      const day = addDays(startOfDay(data.start), i);
      const value = sumFor(day.getTime(), addDays(day, 1).getTime() - 1);
      out.push({
        label: tab === '7d' ? WK[day.getDay()] : `${day.getDate()}/${day.getMonth() + 1}`,
        v: value,
      });
    }
  } else {
    let cursor = new Date(data.start);
    while (cursor.getTime() <= data.end.getTime()) {
      const next = addDays(cursor, 7);
      out.push({
        label: `${cursor.getDate()}/${cursor.getMonth() + 1}`,
        v: sumFor(cursor.getTime(), Math.min(next.getTime() - 1, data.end.getTime())),
      });
      cursor = next;
    }
  }
  return out;
}

export function rangeLabel(data: ReportData, tab: ReportRangeId): string {
  if (tab === '7d') return 'last 7 days';
  if (tab === '30d') return 'last 30 days';
  if (tab === 'month') {
    return data.start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }
  return `${data.start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${data.end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`;
}

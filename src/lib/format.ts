export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const fmtRp = (n?: number | null): string =>
  'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

export const fmtInt = (n?: number | null): string => Math.round(n || 0).toLocaleString('id-ID');

export const compactRp = (n: number): string => {
  if (n >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (n >= 1e3) return Math.round(n / 1e3) + ' rb';
  return String(Math.round(n));
};

export const fmtDate = (d: string | number | Date): string =>
  new Date(d).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const fmtDateShort = (d: string | number | Date): string =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

export const fmtTime = (d: string | number | Date): string => {
  const t = new Date(d);
  return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
};

export const startOfDay = (d: string | number | Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const addDays = (d: string | number | Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const dayDiff = (a: Date, b: Date): number =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);

export const sameDay = (a: Date, b: Date): boolean =>
  startOfDay(a).getTime() === startOfDay(b).getTime();

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const WK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const fmtMMSS = (seconds: number): string =>
  String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0') +
  ':' +
  String(Math.max(0, seconds) % 60).padStart(2, '0');

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

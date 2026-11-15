// Number formatting shared by the data and simulation modules (pure, no DOM).

const NBSP = ' ';

/** 1900 -> "1 900" (non-breaking spaces as thousands separators). */
export function fmt(n, digits = 0) {
  const fixed = Math.abs(n).toFixed(digits);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (n < 0 ? '-' : '') + grouped + (frac ? '.' + frac : '');
}

/** Money in $M, dropping a trailing ".0". */
export function fmtMusd(n) {
  return '$' + (Number.isInteger(n) ? String(n) : n.toFixed(1)) + NBSP + 'M';
}

export const fmtMB = (n) => fmt(Math.round(n)) + NBSP + 'MB';

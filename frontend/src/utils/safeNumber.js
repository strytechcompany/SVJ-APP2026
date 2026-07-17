// Guards against Infinity, -Infinity, NaN, undefined, and null ever reaching
// a display or a save — replaces any non-finite value with 0.
export function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

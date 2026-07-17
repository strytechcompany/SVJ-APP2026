// Guards against Infinity, -Infinity, NaN, undefined, and null ever being
// persisted to MongoDB — replaces any non-finite value with 0.
function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

module.exports = { safeNumber };

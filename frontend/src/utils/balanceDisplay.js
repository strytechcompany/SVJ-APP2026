// Resolves a customer's Old Balance / Advance into exactly one value to display,
// per the app-wide rule: never show both at once, never show a negative Old Balance.
//
// - Old Balance > 0  -> { label: 'Old Balance', value: oldBalance }
// - Advance > 0      -> { label: 'Advance', value: advance }
// - both <= 0        -> { label: 'Current Balance', value: 0 }
// - Old Balance < 0  -> treated as credit owed to the customer, converted to Advance
//   (e.g. Old Balance = -5.150 displays as Advance = 5.150, Old Balance = 0)
export function resolveDisplayBalance(oldBalance, advance) {
  const old = Number(oldBalance) || 0;
  const adv = Number(advance) || 0;

  if (old < 0) {
    return { label: 'Advance', value: Math.abs(old) + Math.max(adv, 0) };
  }
  if (old > 0) {
    return { label: 'Old Balance', value: old };
  }
  if (adv > 0) {
    return { label: 'Advance', value: adv };
  }
  return { label: 'Current Balance', value: 0 };
}

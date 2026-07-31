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

// The stored unit for a customer's oldBalance/advance fields. Every customer
// type stores these in grams EXCEPT a B2C customer in the WASTAGE category,
// who stores them in cash (₹) — the same distinction already used to branch
// Wastage vs Plus/B2D/Line-Stocker calculations throughout the app (see
// TransactionCalculationScreen.js's isWastage, TransactionCustomerCard.js's
// customerCategory check). Never guessed, never converted — just read.
export function isCashBalanceCustomer(customer) {
  return customer?.customerType === 'B2C' && customer?.customerCategory === 'WASTAGE';
}

// Formats a raw balance number in whichever unit it's actually stored in for
// this customer — grams ("3.060g") or cash ("₹23,670.00"). Never mixes them.
export function formatBalanceForCustomer(value, customer) {
  const v = Number(value) || 0;
  return isCashBalanceCustomer(customer)
    ? `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${v.toFixed(3)}g`;
}

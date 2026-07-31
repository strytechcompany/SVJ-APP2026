// Converts the real (gram) previous balance into cash using an admin-entered
// Balance Rate, then derives the Current Old/Advance Balance in cash from
// Item Cash. Whichever side (Old or Advance) was active before stays active
// unless Item Cash flips the sign, per the exact worked examples in the
// Wastage Bill cash-conversion spec:
//   Case 1 (Old active):     net = itemCash - oldCash;      net>=0 -> Old=net,      Advance=0
//                                                             net<0  -> Old=0,        Advance=|net|
//   Case 2 (Advance active): net = itemCash - advanceCash;  net>=0 -> Advance=net,   Old=0
//                                                             net<0  -> Old=|net|,    Advance=0
// This is a derived cash VIEW for the Wastage Bill only — it never touches
// the real gram-based balance, which remains the single source of truth for
// the customer's actual balance everywhere else in the app.
function computeWastageCashBalance(previousOldGram, previousAdvanceGram, balanceRate, itemCash) {
  const isAdvanceCase = previousAdvanceGram > 0 && previousOldGram === 0;
  const previousGram = isAdvanceCase ? previousAdvanceGram : previousOldGram;
  const previousCash = parseFloat((previousGram * balanceRate).toFixed(2));
  const net = parseFloat((itemCash - previousCash).toFixed(2));
  if (isAdvanceCase) {
    return net >= 0
      ? { previousGram, previousCash, oldCash: 0, advanceCash: net }
      : { previousGram, previousCash, oldCash: parseFloat(Math.abs(net).toFixed(2)), advanceCash: 0 };
  }
  return net >= 0
    ? { previousGram, previousCash, oldCash: net, advanceCash: 0 }
    : { previousGram, previousCash, oldCash: 0, advanceCash: parseFloat(Math.abs(net).toFixed(2)) };
}

module.exports = { computeWastageCashBalance };

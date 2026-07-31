const BalanceSettlement = require('../models/BalanceSettlement');
const Customer = require('../models/Customer');
const { safeNumber } = require('../utils/safeNumber');

// Normalizes a customer whose oldBalance/advance somehow went negative (e.g.
// legacy records written before validation was enforced, or via an update
// path that bypassed it) into the app's non-negative, mutually-exclusive
// convention. Mongoose validates BEFORE pre-save middleware runs, so the
// Customer model's own pre-save normalization hook can never fix a document
// that's already invalid — this has to happen in application code first,
// so the fields are already valid by the time .save() validates them.
const normalizeNegativeBalance = async (customer) => {
  if (customer.oldBalance >= 0 && customer.advance >= 0) return customer;
  const net = safeNumber(customer.advance) - safeNumber(customer.oldBalance);
  if (net > 0) {
    customer.advance = net;
    customer.oldBalance = 0;
  } else if (net < 0) {
    customer.oldBalance = Math.abs(net);
    customer.advance = 0;
  } else {
    customer.advance = 0;
    customer.oldBalance = 0;
  }
  await customer.save();
  return customer;
};

// ─── Customers with an Old Balance > 0 ────────────────────────────────────────
// Mirrors getAdvanceBalanceCustomers' self-heal (normalizeNegativeBalance) —
// a negative advance would represent an effective Old Balance under the same
// convention, so it's caught and normalized here too, even though no such
// record exists today.
exports.getOldBalanceCustomers = async (req, res) => {
  try {
    const candidates = await Customer.find({
      isActive: true,
      $or: [{ oldBalance: { $gt: 0 } }, { advance: { $lt: 0 } }],
    });

    const customers = await Promise.all(candidates.map(normalizeNegativeBalance));
    customers.sort((a, b) => b.oldBalance - a.oldBalance);

    res.json({ success: true, data: customers });
  } catch (error) {
    console.error('getOldBalanceCustomers error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching customers' });
  }
};

// ─── Customers with an Advance Balance > 0 ────────────────────────────────────
// A customer's effective Advance is also represented by a negative oldBalance
// (the same convention resolveDisplayBalance already uses for every other
// screen in the app) — a handful of older records predate consistent balance
// normalization and still have that negative value sitting in oldBalance
// instead of a positive advance. Catch both shapes here and self-heal via
// normalizeNegativeBalance so this list — and every other screen reading
// customer.advance afterward — stays consistent.
exports.getAdvanceBalanceCustomers = async (req, res) => {
  try {
    const candidates = await Customer.find({
      isActive: true,
      $or: [{ advance: { $gt: 0 } }, { oldBalance: { $lt: 0 } }],
    });

    const customers = await Promise.all(candidates.map(normalizeNegativeBalance));
    customers.sort((a, b) => b.advance - a.advance);

    res.json({ success: true, data: customers });
  } catch (error) {
    console.error('getAdvanceBalanceCustomers error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching customers' });
  }
};

// Recomputes each item's gram value server-side — never trust a
// client-computed number for the actual balance math.
const sanitizeItems = (items) => items.map((it) => {
  const cashAmount = safeNumber(it.cashAmount);
  const goldRate = safeNumber(it.goldRate);
  const gram = it.mode === 'CASH'
    ? (goldRate > 0 ? safeNumber(cashAmount / goldRate) : 0)
    : safeNumber(it.gram);
  return { mode: it.mode, cashAmount, goldRate, gram };
});

// Same Old<->Advance overflow-conversion formula used throughout the app
// (mirrors LineStockSettlementBillPreviewScreen.js's computeCase1Case2Balance
// for the OLD case; the ADVANCE case is its mirror image).
const computeFinalBalances = (type, previousOldBalance, previousAdvanceBalance, totalSettlementGram) => {
  if (type === 'OLD') {
    const final = safeNumber(previousOldBalance - totalSettlementGram);
    return final < 0
      ? { finalOldBalance: 0, finalAdvanceBalance: safeNumber(previousAdvanceBalance + Math.abs(final)) }
      : { finalOldBalance: final, finalAdvanceBalance: previousAdvanceBalance };
  }
  const final = safeNumber(previousAdvanceBalance - totalSettlementGram);
  return final < 0
    ? { finalOldBalance: safeNumber(previousOldBalance + Math.abs(final)), finalAdvanceBalance: 0 }
    : { finalOldBalance: previousOldBalance, finalAdvanceBalance: final };
};

// ─── Create a Balance Settlement (Old or Advance) ─────────────────────────────
// Always reads the customer's LIVE balance from MongoDB (never a cached/passed
// value) so this reflects whatever every other module has already saved.
exports.createSettlement = async (req, res) => {
  try {
    const { customerId, type, settlementMode, items, remarks } = req.body;

    if (!['OLD', 'ADVANCE'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be OLD or ADVANCE' });
    }
    if (!['CASH', 'GRAM'].includes(settlementMode)) {
      return res.status(400).json({ success: false, message: 'settlementMode must be CASH or GRAM' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one settlement item is required' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sanitizedItems = sanitizeItems(items);
    const totalSettlementGram = safeNumber(sanitizedItems.reduce((s, it) => s + it.gram, 0));

    const previousOldBalance = safeNumber(customer.oldBalance);
    const previousAdvanceBalance = safeNumber(customer.advance);
    const { finalOldBalance, finalAdvanceBalance } = computeFinalBalances(
      type, previousOldBalance, previousAdvanceBalance, totalSettlementGram
    );

    customer.oldBalance = finalOldBalance;
    customer.advance = finalAdvanceBalance;
    await customer.save();

    const billNumber = await BalanceSettlement.generateBillNumber(type);

    const settlement = await BalanceSettlement.create({
      billNumber,
      type,
      customerId,
      settlementMode,
      items: sanitizedItems,
      totalSettlementGram,
      previousOldBalance,
      previousAdvanceBalance,
      finalOldBalance,
      finalAdvanceBalance,
      remarks: remarks || '',
      createdBy: req.user?._id,
    });

    const populated = await BalanceSettlement.findById(settlement._id).populate('customerId');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error('createSettlement (balance) error:', error);
    res.status(500).json({ success: false, message: 'Server error saving settlement' });
  }
};

// ─── Edit a saved Settlement (Settlement Amount / Cash / Gram / Remarks) ─────
// Reverses this settlement's effect on the customer (restoring the balance to
// what it was immediately before this settlement — the previousOldBalance/
// previousAdvanceBalance snapshot taken at creation time), then re-applies the
// SAME formula as createSettlement using the edited items. Assumes no other
// settlement has touched this customer since (this app keeps no ledger chain
// beyond that one snapshot) — matches the granularity already used elsewhere
// (e.g. Delete, below).
exports.updateSettlement = async (req, res) => {
  try {
    const { items, remarks, settlementMode } = req.body;
    const settlement = await BalanceSettlement.findById(req.params.id);
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one settlement item is required' });
    }

    const customer = await Customer.findById(settlement.customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sanitizedItems = sanitizeItems(items);
    const totalSettlementGram = safeNumber(sanitizedItems.reduce((s, it) => s + it.gram, 0));

    // Base off this settlement's OWN before-snapshot, not the customer's
    // current (possibly already-edited-away) balance.
    const { finalOldBalance, finalAdvanceBalance } = computeFinalBalances(
      settlement.type, settlement.previousOldBalance, settlement.previousAdvanceBalance, totalSettlementGram
    );

    customer.oldBalance = finalOldBalance;
    customer.advance = finalAdvanceBalance;
    await customer.save();

    settlement.items = sanitizedItems;
    settlement.totalSettlementGram = totalSettlementGram;
    settlement.finalOldBalance = finalOldBalance;
    settlement.finalAdvanceBalance = finalAdvanceBalance;
    if (settlementMode !== undefined) settlement.settlementMode = settlementMode;
    if (remarks !== undefined) settlement.remarks = remarks;
    await settlement.save();

    const populated = await BalanceSettlement.findById(settlement._id).populate('customerId');
    res.json({ success: true, data: populated });
  } catch (error) {
    console.error('updateSettlement (balance) error:', error);
    res.status(500).json({ success: false, message: 'Server error updating settlement' });
  }
};

// ─── Delete a saved Settlement ────────────────────────────────────────────────
// Restores the customer to exactly the balance recorded before this
// settlement (previousOldBalance/previousAdvanceBalance), then removes the
// settlement record.
exports.deleteSettlement = async (req, res) => {
  try {
    const settlement = await BalanceSettlement.findById(req.params.id);
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }

    const customer = await Customer.findById(settlement.customerId);
    if (customer) {
      customer.oldBalance = settlement.previousOldBalance;
      customer.advance = settlement.previousAdvanceBalance;
      await customer.save();
    }

    await BalanceSettlement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Settlement deleted and customer balance restored' });
  } catch (error) {
    console.error('deleteSettlement (balance) error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting settlement' });
  }
};

// ─── Global settlement history (all customers) for a type — newest first ─────
exports.getSettlementsByType = async (req, res) => {
  try {
    const { type } = req.params;
    if (!['OLD', 'ADVANCE'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be OLD or ADVANCE' });
    }
    const settlements = await BalanceSettlement.find({ type })
      .populate('customerId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: settlements });
  } catch (error) {
    console.error('getSettlementsByType (balance) error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching settlement history' });
  }
};

// ─── Settlement history for a customer (Old or Advance) ──────────────────────
exports.getSettlementsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { type } = req.query;
    const query = { customerId };
    if (type && ['OLD', 'ADVANCE'].includes(type)) query.type = type;

    const settlements = await BalanceSettlement.find(query)
      .populate('customerId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: settlements });
  } catch (error) {
    console.error('getSettlementsByCustomer (balance) error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching settlement history' });
  }
};

// ─── Single settlement (for Bill Preview / Print) ─────────────────────────────
exports.getSettlementById = async (req, res) => {
  try {
    const settlement = await BalanceSettlement.findById(req.params.id).populate('customerId');
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }
    res.json({ success: true, data: settlement });
  } catch (error) {
    console.error('getSettlementById (balance) error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching settlement' });
  }
};

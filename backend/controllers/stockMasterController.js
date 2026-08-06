const StockMaster = require('../models/StockMaster');

// ─── Add Stock ──────────────────────────────────────────────────────────────
// Additive by design: adding the same Item Name again (case-insensitive) tops
// up that item's existing Total Weight pool instead of creating a duplicate
// record — required so bill-time deduction always has exactly one pool per
// name to match against.
exports.createStockMaster = async (req, res) => {
  try {
    const { itemName, totalWeight, description } = req.body;
    if (!itemName || !String(itemName).trim()) {
      return res.status(400).json({ success: false, message: 'Item Name is required.' });
    }
    const weight = parseFloat(totalWeight);
    if (!Number.isFinite(weight) || weight < 0) {
      return res.status(400).json({ success: false, message: 'Enter a valid Total Weight.' });
    }

    const nameLower = String(itemName).trim().toLowerCase();
    let item = await StockMaster.findOne({ itemNameLower: nameLower });
    if (item) {
      item.totalWeight = parseFloat((item.totalWeight + weight).toFixed(3));
      if (description !== undefined && description !== '') item.description = description.trim();
      await item.save();
    } else {
      item = await StockMaster.create({
        itemName: itemName.trim(),
        totalWeight: weight,
        description: (description || '').trim(),
        createdBy: req.user?._id,
      });
    }

    res.status(201).json({ success: true, message: 'Stock saved successfully.', data: item });
  } catch (error) {
    console.error('createStockMaster error:', error.message);
    res.status(500).json({ success: false, message: 'Server error saving stock.' });
  }
};

// ─── Get All Stock (search by name) ────────────────────────────────────────
exports.getAllStockMaster = async (req, res) => {
  try {
    const { search = '' } = req.query;
    const query = {};
    if (search.trim()) {
      query.itemName = { $regex: search.trim(), $options: 'i' };
    }
    const items = await StockMaster.find(query).sort({ itemName: 1 });
    res.json({ success: true, data: items });
  } catch (error) {
    console.error('getAllStockMaster error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching stock.' });
  }
};

exports.getStockMasterById = async (req, res) => {
  try {
    const item = await StockMaster.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Stock item not found.' });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching stock item.' });
  }
};

// ─── Edit Stock — direct correction, NOT additive ──────────────────────────
exports.updateStockMaster = async (req, res) => {
  try {
    const { itemName, totalWeight, description } = req.body;
    const item = await StockMaster.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Stock item not found.' });

    if (itemName !== undefined) {
      if (!String(itemName).trim()) {
        return res.status(400).json({ success: false, message: 'Item Name is required.' });
      }
      const nameLower = String(itemName).trim().toLowerCase();
      if (nameLower !== item.itemNameLower) {
        const clash = await StockMaster.findOne({ itemNameLower: nameLower, _id: { $ne: item._id } });
        if (clash) {
          return res.status(400).json({ success: false, message: `Item Name "${itemName.trim()}" already exists.` });
        }
      }
      item.itemName = itemName.trim();
    }
    if (totalWeight !== undefined) {
      const weight = parseFloat(totalWeight);
      if (!Number.isFinite(weight) || weight < 0) {
        return res.status(400).json({ success: false, message: 'Enter a valid Total Weight.' });
      }
      item.totalWeight = weight;
    }
    if (description !== undefined) item.description = description.trim();

    await item.save();
    res.json({ success: true, message: 'Stock updated successfully.', data: item });
  } catch (error) {
    console.error('updateStockMaster error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating stock.' });
  }
};

exports.deleteStockMaster = async (req, res) => {
  try {
    const item = await StockMaster.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Stock item not found.' });
    res.json({ success: true, message: 'Stock item deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error deleting stock item.' });
  }
};

// ─── Internal helpers used by transactionController ────────────────────────

// Case-insensitive availability check — never trusts the client's own math.
// Returns the matched document (or null if no stock is tracked under that
// name, which is treated as zero available).
const findByName = (itemName) => {
  const nameLower = String(itemName || '').trim().toLowerCase();
  if (!nameLower) return null;
  return StockMaster.findOne({ itemNameLower: nameLower });
};

// Validates a batch of {itemName, weight} issue items against live stock
// BEFORE any deduction is written — so a single insufficient item blocks the
// whole bill instead of partially deducting. Returns { ok: true } or
// { ok: false, message }.
exports.validateIssueWeights = async (issueItems) => {
  const totals = new Map(); // nameLower -> total requested weight across items sharing a name
  for (const it of issueItems || []) {
    const name = String(it.itemName || '').trim();
    if (!name) continue;
    const weight = parseFloat(it.weight) || 0;
    if (weight <= 0) continue;
    const key = name.toLowerCase();
    totals.set(key, (totals.get(key) || 0) + weight);
  }
  for (const [nameLower, requested] of totals) {
    const stock = await StockMaster.findOne({ itemNameLower: nameLower });
    const available = stock ? stock.totalWeight : 0;
    if (requested > available + 1e-6) {
      return { ok: false, message: 'Insufficient Stock Available' };
    }
  }
  return { ok: true };
};

// Deducts issued weight from each matched named stock item. Assumes
// validateIssueWeights already confirmed sufficient availability.
exports.deductIssueWeights = async (issueItems) => {
  for (const it of issueItems || []) {
    const name = String(it.itemName || '').trim();
    const weight = parseFloat(it.weight) || 0;
    if (!name || weight <= 0) continue;
    const stock = await findByName(name);
    if (!stock) continue;
    stock.totalWeight = parseFloat(Math.max(0, stock.totalWeight - weight).toFixed(3));
    await stock.save();
  }
};

// Restores issued weight back to each matched named stock item — used when a
// bill is edited (reversing the old items) or deleted.
exports.restoreIssueWeights = async (issueItems) => {
  for (const it of issueItems || []) {
    const name = String(it.itemName || '').trim();
    const weight = parseFloat(it.weight) || 0;
    if (!name || weight <= 0) continue;
    const stock = await findByName(name);
    if (!stock) continue;
    stock.totalWeight = parseFloat((stock.totalWeight + weight).toFixed(3));
    await stock.save();
  }
};

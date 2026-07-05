const Stock = require('../models/Stock');

const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value).replace(/,/g, '').trim();
  const match = normalized.match(/-?\d*\.?\d+/);
  if (!match) return 0;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : 0;
};

// ─── Create Stock ────────────────────────────────────────────────────────────
exports.createStock = async (req, res) => {
  try {
    const {
      designName,
      itemName,
      itemNumber,
      supplierName,
      category,
      purity,
      grossWeight,
      netWeight,
      buyingTouch,
      quantity,
      notes,
      barcode,
    } = req.body;

    if (!itemNumber || !String(itemNumber).trim()) {
      return res.status(400).json({ success: false, message: 'Item Number is required.' });
    }

    const inTrimmed = String(itemNumber).trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(inTrimmed)) {
      return res.status(400).json({ success: false, message: 'Item Number must contain letters and numbers only (e.g. TH001, CH002).' });
    }

    const duplicate = await Stock.findOne({ itemNumber: inTrimmed });
    if (duplicate) {
      return res.status(400).json({ success: false, message: `Item Number "${inTrimmed}" already exists. Use a unique Item Number.` });
    }

    const stock = new Stock({
      itemNumber: inTrimmed,
      designName,
      itemName: itemName?.trim() || '',
      supplierName,
      category,
      purity,
      grossWeight: parseFloat(grossWeight) || 0,
      netWeight: parseFloat(netWeight) || 0,
      buyingTouch: parseFloat(buyingTouch) || 0,
      quantity: parseInt(quantity) || 1,
      notes,
      barcode: barcode?.trim() || undefined,
      createdBy: req.user._id,
    });

    await stock.save();

    res.status(201).json({
      success: true,
      message: 'Stock item created successfully',
      data: stock,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('createStock error:', error.message);
    res.status(500).json({ success: false, message: 'Server error creating stock' });
  }
};

// ─── Get All Stock (paginated, search, filter) ───────────────────────────────
exports.getAllStock = async (req, res) => {
  try {
    const {
      search = '',
      category = 'All',
      page = 1,
      limit = 50,
      scan = '',      // scan=true bypasses isActive/isAvailable filters for scanner lookups
    } = req.query;

    console.log('[getAllStock] query params:', {
      search,
      category,
      page,
      limit,
      scan,
    });

    // When called from a scanner, skip the isActive filter so all items are searchable.
    // isAvailable is NOT filtered here — items issued via line stock (isAvailable=false)
    // still belong in the stock view so the owner can track them.
    const query = scan === 'true' ? {} : { isActive: true };

    // Category filter
    if (category && category !== 'All') {
      query.category = category;
    }

    // Search filter
    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { designName: regex },
        { itemNumber: regex },
        { category: regex },
        { itemName: regex },
        { barcode: regex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Stock.countDocuments(query);

    console.log('[getAllStock] mongo query:', JSON.stringify(query), 'skip=', skip, 'total=', total);

    const stocks = await Stock.find(query)
      .sort({ designName: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Group by designName
    const grouped = {};
    stocks.forEach((item) => {
      const designName = String(item.designName || '').trim();
      const key = designName ? designName.toUpperCase() : String(item._id);
      if (!grouped[key]) {
        grouped[key] = {
          designName: designName || 'Untitled',
          groupKey: key,
          records: [],
          totalQty: 0,
          totalNetWeight: 0,
          totalStockWeight: 0,
          totalWeight: 0,
        };
      }
      grouped[key].records.push(item);
      const quantity = parseNumericValue(item.quantity ?? item.qty ?? item.pcs ?? item.totalQty);
      const weight = parseNumericValue(
        item.grossWeight ??
        item.netWeight ??
        item.totalWeight ??
        item.weight
      );
      grouped[key].totalQty += quantity;
      grouped[key].totalNetWeight += weight;
      grouped[key].totalStockWeight += weight;
      grouped[key].totalWeight += weight;
    });

    const groupedArray = Object.values(grouped).map((g) => ({
      ...g,
      totalQty: parseFloat(g.totalQty.toFixed(3)),
      totalNetWeight: parseFloat(g.totalNetWeight.toFixed(3)),
      totalStockWeight: parseFloat(g.totalStockWeight.toFixed(3)),
      totalWeight: parseFloat(g.totalWeight.toFixed(3)),
    }));

    console.log('[getAllStock] fetched docs:', stocks.length, 'grouped results:', groupedArray.length);
    console.log('[getAllStock] grouped totals:', groupedArray.reduce((acc, group) => ({
      totalDesigns: acc.totalDesigns + 1,
      totalQuantity: acc.totalQuantity + parseNumericValue(group.totalQty),
      totalStockWeight: acc.totalStockWeight + parseNumericValue(group.totalStockWeight),
    }), { totalDesigns: 0, totalQuantity: 0, totalStockWeight: 0 }));

    res.json({
      success: true,
      data: groupedArray,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('getAllStock error:', error.message);
    console.error('getAllStock stack:', error.stack);
    res.status(500).json({ success: false, message: 'Server error fetching stock' });
  }
};

// ─── Get Stock Summary ────────────────────────────────────────────────────────
exports.getStockSummary = async (req, res) => {
  try {
    const toNumber = parseNumericValue;

    const getQuantity = (doc) => toNumber(
      doc?.quantity ?? doc?.qty ?? doc?.pcs ?? doc?.totalQty
    );

    const getWeight = (doc) => toNumber(
      doc?.grossWeight ??
      doc?.netWeight ??
      doc?.totalWeight ??
      doc?.weight ??
      0
    );

    const stocks = await Stock.find({}).lean();
    console.log('[getStockSummary] total records fetched from MongoDB:', stocks.length);

    const summary = stocks.reduce((acc, doc) => {
      acc.totalDesigns += 1;
      acc.totalQuantity += getQuantity(doc);
      acc.totalStockWeight += getWeight(doc);
      return acc;
    }, { totalDesigns: 0, totalQuantity: 0, totalStockWeight: 0 });

    summary.totalNetWeight = parseFloat(summary.totalStockWeight.toFixed(3));
    summary.totalStockWeight = parseFloat(summary.totalStockWeight.toFixed(3));

    console.log('[getStockSummary] totals:', summary);

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('getStockSummary error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching summary' });
  }
};

// ─── Get Single Stock ─────────────────────────────────────────────────────────
exports.getStockById = async (req, res) => {
  try {
    const stock = await Stock.findOne({
      _id: req.params.id,
      isActive: true,
    }).populate('createdBy', 'name');

    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock item not found' });
    }

    res.json({ success: true, data: stock });
  } catch (error) {
    console.error('getStockById error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching stock item' });
  }
};

// Get stock by barcode — no isActive/isAvailable filter so items can be looked up anytime
exports.getStockByBarcode = async (req, res) => {
  try {
    const rawValue = String(req.params.barcode || '');
    const value = rawValue.trim();
    console.log('[getStockByBarcode] searching for:', JSON.stringify(value));

    const buildCandidates = (input) => {
      const base = String(input || '').trim();
      if (!base) return [];

      const collapsed = base.replace(/\s+/g, ' ');
      const noSpaces = base.replace(/\s+/g, '');
      const compact = base.replace(/[^a-zA-Z0-9_-]/g, '');
      const tokenParts = base
        .split(/[\s|,;:/\\]+/)
        .map((part) => part.trim())
        .filter(Boolean);

      return [...new Set([base, collapsed, noSpaces, compact, ...tokenParts])];
    };

    const candidates = buildCandidates(value);
    const findByAnyField = async (patternBuilder) => {
      for (const candidate of candidates) {
        const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = patternBuilder(escaped);
        const stock = await Stock.findOne({
          $or: [
            { barcode: pattern },
            { itemNumber: pattern },
          ],
        });
        if (stock) return stock;
      }
      return null;
    };

    // 1. Exact match on barcode/itemNumber
    let stock = await findByAnyField((escaped) => new RegExp(`^${escaped}$`, 'i'));

    // 2. Contains match across all text fields (catches partial / truncated labels)
    if (!stock) {
      stock = await findByAnyField((escaped) => new RegExp(escaped, 'i'));
    }

    if (!stock) {
      console.log('[getStockByBarcode] not found for value:', JSON.stringify(value));
      return res.status(404).json({ success: false, message: 'Item not found for this barcode' });
    }
    console.log('[getStockByBarcode] found:', stock.itemNumber, stock.barcode);
    res.json({ success: true, data: stock });
  } catch (error) {
    console.error('Get Stock by Barcode Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Update Stock ─────────────────────────────────────────────────────────────
exports.updateStock = async (req, res) => {
  try {
    const {
      designName,
      itemName,
      itemNumber,
      supplierName,
      category,
      purity,
      grossWeight,
      netWeight,
      buyingTouch,
      quantity,
      notes,
    } = req.body;

    const stock = await Stock.findOne({ _id: req.params.id, isActive: true });
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock item not found' });
    }

    if (itemNumber !== undefined && String(itemNumber).trim()) {
      const inTrimmed = String(itemNumber).trim().toUpperCase();
      if (!/^[A-Z0-9]+$/.test(inTrimmed)) {
        return res.status(400).json({ success: false, message: 'Item Number must contain letters and numbers only (e.g. TH001, CH002).' });
      }
      const duplicate = await Stock.findOne({ itemNumber: inTrimmed, _id: { $ne: req.params.id } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: `Item Number "${inTrimmed}" already exists. Use a unique Item Number.` });
      }
      stock.itemNumber = inTrimmed;
    }

    if (designName !== undefined) stock.designName = designName;
    if (itemName !== undefined) stock.itemName = itemName;
    if (supplierName !== undefined) stock.supplierName = supplierName;
    if (category !== undefined) stock.category = category;
    if (purity !== undefined) stock.purity = purity;
    if (grossWeight !== undefined) stock.grossWeight = parseFloat(grossWeight);
    if (netWeight !== undefined) stock.netWeight = parseFloat(netWeight);
    if (buyingTouch !== undefined) stock.buyingTouch = parseFloat(buyingTouch);
    if (quantity !== undefined) stock.quantity = parseInt(quantity);
    if (notes !== undefined) stock.notes = notes;

    await stock.save();

    res.json({
      success: true,
      message: 'Stock item updated successfully',
      data: stock,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('updateStock error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating stock' });
  }
};

// ─── Delete Stock ─────────────────────────────────────────────────────────────
exports.deleteStock = async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id);
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock item not found' });
    }

    const Transaction = require('../models/Transaction');
    const LineStockTransaction = require('../models/LineStockTransaction');

    const [txnRef, lineRef] = await Promise.all([
      Transaction.exists({ 'issueItems.stockId': stock._id }),
      LineStockTransaction.exists({ 'issuedProducts.stockId': stock._id }),
    ]);

    if (txnRef || lineRef) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete — this item is linked to existing transactions. Contact admin to resolve.',
      });
    }

    await Stock.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Stock item deleted successfully' });
  } catch (error) {
    console.error('deleteStock error:', error.message);
    res.status(500).json({ success: false, message: 'Server error deleting stock' });
  }
};

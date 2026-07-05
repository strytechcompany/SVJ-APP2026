const Order = require('../models/Order');
const Customer = require('../models/Customer');
const GoldRate = require('../models/GoldRate');

// ─── Create Order ──────────────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const {
      customerId,
      orderItems,
      paymentMode = 'None',
      paymentAmount,
      goldPayWeight,
      goldPayPurity,
      notes,
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer is required.' });
    }
    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one order item is required.' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    // Get current gold rate
    const goldRateDoc = await GoldRate.findOne().sort({ createdAt: -1 });
    const goldRate = goldRateDoc?.rate || 0;

    // Calculate advance contribution
    let advanceCashAmount = 0;
    let advanceGramFromCash = 0;
    let advanceGramFromGold = 0;
    let advanceTotalGram = 0;

    if (paymentMode === 'Cash') {
      advanceCashAmount = parseFloat(paymentAmount) || 0;
      advanceGramFromCash = goldRate > 0 ? advanceCashAmount / goldRate : 0;
      advanceTotalGram = advanceGramFromCash;
    } else if (paymentMode === 'Gold') {
      advanceGramFromGold = parseFloat(goldPayWeight) || 0;
      advanceTotalGram = advanceGramFromGold;
    }

    // Snapshot balances before
    const oldBalanceBefore = parseFloat(customer.oldBalance) || 0;
    const advanceBalanceBefore = parseFloat(customer.advance) || 0;

    let oldBalanceAfter = oldBalanceBefore;
    let advanceBalanceAfter = advanceBalanceBefore;

    if (advanceTotalGram > 0) {
      if (oldBalanceBefore > 0) {
        // Apply advance to clear old balance first
        const remaining = advanceTotalGram - oldBalanceBefore;
        if (remaining >= 0) {
          oldBalanceAfter = 0;
          advanceBalanceAfter = advanceBalanceBefore + remaining;
        } else {
          oldBalanceAfter = oldBalanceBefore - advanceTotalGram;
          advanceBalanceAfter = 0;
        }
      } else {
        advanceBalanceAfter = advanceBalanceBefore + advanceTotalGram;
      }

      // Update customer balances
      customer.oldBalance = parseFloat(Math.max(0, oldBalanceAfter).toFixed(6));
      customer.advance = parseFloat(Math.max(0, advanceBalanceAfter).toFixed(6));
      await customer.save();
    }

    const order = new Order({
      customerId,
      customerType: customer.customerType,
      orderItems,
      paymentMode,
      paymentAmount: advanceCashAmount,
      goldPayWeight: parseFloat(goldPayWeight) || 0,
      goldPayPurity: goldPayPurity || '22K (916)',
      goldRate,
      advanceCashAmount,
      advanceGramFromCash,
      advanceGramFromGold,
      advanceTotalGram,
      oldBalanceBefore,
      oldBalanceAfter,
      advanceBalanceBefore,
      advanceBalanceAfter,
      status: 'Pending',
      notes: notes || '',
      createdBy: req.user._id,
      createdByName: req.user.name || '',
    });

    await order.save();
    await order.populate('customerId', 'customerName phoneNumber customerType shopName advance oldBalance');

    res.status(201).json({ success: true, message: 'Order created successfully.', data: order });
  } catch (error) {
    console.error('createOrder error:', error.message);
    res.status(500).json({ success: false, message: 'Server error creating order.' });
  }
};

// ─── Get All Orders ────────────────────────────────────────────────────────────
exports.getAllOrders = async (req, res) => {
  try {
    const { search = '', status = 'All', page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'All') query.status = status;

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      const customerMatches = await Customer.find({
        $or: [{ customerName: regex }, { phoneNumber: regex }],
      }).select('_id');
      const customerIds = customerMatches.map((c) => c._id);

      query.$or = [
        { customerId: { $in: customerIds } },
        { orderNumber: regex },
        { 'orderItems.itemName': regex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate('customerId', 'customerName phoneNumber customerType shopName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('getAllOrders error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching orders.' });
  }
};

// ─── Get Single Order ──────────────────────────────────────────────────────────
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      'customerId',
      'customerName phoneNumber customerType shopName address advance oldBalance'
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('getOrderById error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching order.' });
  }
};

// ─── Update Order Status ───────────────────────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Ready', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('customerId', 'customerName phoneNumber customerType shopName');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('updateOrderStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating status.' });
  }
};

// ─── Delete Order ──────────────────────────────────────────────────────────────
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Reverse advance balance only if payment was made
    if (order.advanceTotalGram > 0) {
      const customer = await Customer.findById(order.customerId);
      if (customer) {
        // Restore to before-order snapshots
        customer.oldBalance = parseFloat(Math.max(0, order.oldBalanceBefore).toFixed(6));
        customer.advance = parseFloat(Math.max(0, order.advanceBalanceBefore).toFixed(6));
        await customer.save();
      }
    }

    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Order deleted successfully.' });
  } catch (error) {
    console.error('deleteOrder error:', error.message);
    res.status(500).json({ success: false, message: 'Server error deleting order.' });
  }
};

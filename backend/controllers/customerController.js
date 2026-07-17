const Customer = require('../models/Customer');

// ─── Create Customer ──────────────────────────────────────────────────────────
exports.createCustomer = async (req, res) => {
  try {
    const {
      customerType,
      customerName,
      phoneNumber,
      shopName,
      dealerCompanyName,
      dealerCode,
      gstNumber,
      address,
      customerCategory,
      oldBalance,
      advance,
      remarks,
    } = req.body;

    // Type-specific required fields
    if (customerType === 'B2D' && !dealerCompanyName?.trim()) {
      return res.status(400).json({ success: false, message: 'Dealer Company Name is required for B2D customers' });
    }
    if (customerType === 'B2C' && !customerCategory) {
      return res.status(400).json({ success: false, message: 'Please specify whether the customer is a Plus User or Wastage User' });
    }

    const customerPayload = {
      customerType,
      customerName: customerName?.trim() || '',
      phoneNumber: phoneNumber?.trim() || '',
      shopName: shopName?.trim() || '',
      dealerCompanyName: dealerCompanyName?.trim() || '',
      dealerCode: dealerCode?.trim() || '',
      gstNumber: gstNumber?.trim() || '',
      address: address?.trim() || '',
      customerCategory: customerType === 'B2C' ? customerCategory : undefined,
      oldBalance: parseFloat(oldBalance) || 0,
      advance: parseFloat(advance) || 0,
      remarks: remarks?.trim() || '',
      createdBy: req.user?.name || req.user?.email || 'System',
    };

    const saveWithCodeRetry = async () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const customer = new Customer({
            ...customerPayload,
            customerCode: await Customer.generateCustomerCode(customerPayload.customerType),
          });
          return await customer.save();
        } catch (error) {
          const isCodeConflict =
            error.code === 11000 &&
            (error.keyPattern?.customerCode || String(error.message || '').includes('customerCode'));

          if (isCodeConflict && attempt < 5) {
            console.warn(
              '[createCustomer] customerCode collision, retrying',
              error.keyValue || error.message
            );
            continue;
          }
          throw error;
        }
      }
      throw new Error('Unable to create customer after multiple code retries');
    };

    const savedCustomer = await saveWithCodeRetry();

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: savedCustomer,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || Object.keys(error.keyValue || {})[0];
      if (duplicateField === 'customerName') {
        return res.status(409).json({
          success: false,
          message: 'Customer with the same name and shop name already exists.',
        });
      }
      if (duplicateField === 'customerId') {
        return res.status(409).json({
          success: false,
          message: 'A legacy customer index conflict was detected. Please restart the server and try again.',
        });
      }
      return res.status(409).json({
        success: false,
        message: 'Customer code already exists. Please try again.',
      });
    }
    console.error('createCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Server error creating customer' });
  }
};

// ─── Get All Customers ────────────────────────────────────────────────────────
exports.getAllCustomers = async (req, res) => {
  try {
    const { search = '', type = 'All', page = 1, limit = 20 } = req.query;

    const query = { isActive: true };

    if (type && type !== 'All') {
      query.customerType = type;
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { customerName: regex },
        { phoneNumber: regex },
        { customerCode: regex },
        { shopName: regex },
        { dealerCompanyName: regex },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Customer.countDocuments(query);

    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: customers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('getAllCustomers error:', error.message);
    res.status(500).json({ success: false, message: 'Server error fetching customers' });
  }
};

// ─── Get Customer By ID ───────────────────────────────────────────────────────
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.json({ success: true, data: customer });
  } catch (error) {
    console.error('getCustomerById error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Update Customer ──────────────────────────────────────────────────────────
exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, isActive: true });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const fields = [
      'customerName', 'phoneNumber', 'shopName', 'dealerCompanyName',
      'dealerCode', 'gstNumber', 'address', 'oldBalance', 'advance', 'remarks',
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        customer[field] = typeof req.body[field] === 'string'
          ? req.body[field].trim()
          : req.body[field];
      }
    });

    await customer.save();

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: customer,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('updateCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating customer' });
  }
};

// ─── Delete Customer (soft) ───────────────────────────────────────────────────
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, isActive: true });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    customer.isActive = false;
    await customer.save();
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('deleteCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Search Customers ─────────────────────────────────────────────────────────
exports.searchCustomers = async (req, res) => {
  try {
    const { q = '', type = 'All', limit = 20 } = req.query;
    const query = { isActive: true };

    if (type !== 'All') query.customerType = type;

    if (q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [
        { customerName: regex },
        { phoneNumber: regex },
        { customerCode: regex },
        { shopName: regex },
        { dealerCompanyName: regex },
      ];
    }

    const customers = await Customer.find(query)
      .sort({ customerName: 1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: customers });
  } catch (error) {
    console.error('searchCustomers error:', error.message);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

// ─── Get Customers By Type ────────────────────────────────────────────────────
exports.getByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!['B2C', 'B2D', 'LINE_STOCKER'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid customer type' });
    }

    const query = { customerType: type, isActive: true };
    const total = await Customer.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort by most recent activity (last transaction date), falling back to
    // creation date for customers who haven't transacted yet. This screen has
    // no customerCategory filter — B2C's Plus and Wastage customers are always
    // queried together — but sorting by createdAt alone let whichever category
    // had more recently-created customer records crowd the other out of this
    // limited "recent" page. Sorting by actual activity fixes that.
    const customers = await Customer.aggregate([
      { $match: query },
      { $addFields: { sortActivity: { $ifNull: ['$lastTransactionDate', '$createdAt'] } } },
      { $sort: { sortActivity: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    res.json({
      success: true,
      data: customers,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('getByType error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const axios = require('axios');
const connectDB = require('./config/mongodb');
const authRoutes = require('./routes/authRoutes');
const otpRoutes = require('./routes/otpRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const stockRoutes = require('./routes/stockRoutes');
const customerRoutes = require('./routes/customerRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const cashLedgerRoutes = require('./routes/cashLedgerRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const chitRoutes = require('./routes/chitRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const lineStockRoutes = require('./routes/lineStockRoutes');
const settingRoutes = require('./routes/settingRoutes');
const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { loadUsers } = require('./services/authStore');
const Customer = require('./models/Customer');

dotenv.config();

loadUsers();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cash-ledger', cashLedgerRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/chits', chitRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/linestock', lineStockRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).json({ success: true, message: 'Sri Vaishnavi Jewellers API is running' });
  } catch {
    res.status(503).json({ success: false, message: 'Database not ready' });
  }
});

app.get('/api/test-email', async (req, res) => {
  const result = {
    env: {
      BREVO_API_KEY: process.env.BREVO_API_KEY ? '✓ set' : '✗ missing',
      EMAIL_USER: process.env.EMAIL_USER || '✗ missing',
    },
  };
  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: 'Sri Vaishnavi Jewellers', email: process.env.EMAIL_USER },
        to: [{ email: process.env.EMAIL_USER }],
        subject: 'Render Test Email',
        textContent: 'OTP email is working from Render!',
      },
      {
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );
    result.emailSent = '✓ sent';
    result.messageId = response.data.messageId;
  } catch (err) {
    result.error = err.response?.data?.message || err.message;
  }
  res.json(result);
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
const LEGACY_CUSTOMER_INDEXES = ['customerId_1', 'customerName_1_shopName_1'];

const dropLegacyCustomerIndexes = async () => {
  try {
    const indexes = await Customer.collection.indexes();
    const names = new Set(indexes.map((index) => index.name));

    for (const indexName of LEGACY_CUSTOMER_INDEXES) {
      if (names.has(indexName)) {
        await Customer.collection.dropIndex(indexName);
        console.log(`[Customer] Dropped legacy index: ${indexName}`);
      }
    }
  } catch (error) {
    console.warn(`[Customer] Unable to normalize indexes: ${error.message}`);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    await dropLegacyCustomerIndexes();
    await Customer.initializeCounters();
  } catch (error) {
    console.error(`[FATAL] MongoDB connection failed: ${error.message}`);
    console.error('[FATAL] Check MONGO_URI env var and MongoDB Atlas IP whitelist (add 0.0.0.0/0 for Render)');
    process.exit(1);
  }

  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await seedDatabase();
    await purgeInactiveStocks();
  });
};

startServer();

// Cleans up ghost records left behind by the old soft-delete (isActive: false).
// Runs once at every server start — safe to keep permanently.
const purgeInactiveStocks = async () => {
  try {
    const Stock = require('./models/Stock');
    const result = await Stock.deleteMany({ isActive: false });
    if (result.deletedCount > 0) {
      console.log(`[Startup] Purged ${result.deletedCount} soft-deleted stock record(s)`);
    }
  } catch (err) {
    console.warn('[Startup] Could not purge inactive stocks:', err.message);
  }
};

const seedDatabase = async () => {
  try {
    const Settings = require('./models/Settings');
    const User = require('./models/User');
    const GoldRate = require('./models/GoldRate');
    const IssuedRecord = require('./models/IssuedRecord');

    const settingsExist = await Settings.findOne();
    if (!settingsExist) {
      await Settings.create({ appName: 'Sri Vaishnavi Jewellers', maxUsers: 6 });
      console.log('Settings seeded');
    }

    const superAdminEmail = 'srivaishnavijewellers1@gmail.com';
    let superAdmin = await User.findOne({ email: superAdminEmail });
    if (!superAdmin) {
      const initialPassword = '123456';
      await User.create({
        name: 'Svjadmin',
        email: superAdminEmail,
        password: initialPassword,
        role: 'SuperAdmin',
      });
      console.log(`[Seed] SuperAdmin created: ${superAdminEmail} | Initial password: ${initialPassword}`);
    } else if (superAdmin.role !== 'SuperAdmin') {
      superAdmin.role = 'SuperAdmin';
      await superAdmin.save();
      console.log(`[Seed] SuperAdmin role upgraded for: ${superAdminEmail}`);
    }

    const goldRateExists = await GoldRate.findOne();
    if (!goldRateExists) {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      await GoldRate.create({
        rate: 0,
        effectiveDate: `${day}-${month}-${year}`,
        updatedBy: 'System',
        updatedAt: now,
      });
      console.log('Gold Rate initialized');
    }
  } catch (error) {
    console.error('Seed Error:', error.message);
  }
};

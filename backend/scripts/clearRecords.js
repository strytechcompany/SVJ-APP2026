/**
 * One-time script to clear all transaction-related documents from MongoDB.
 * Run: node scripts/clearRecords.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const COLLECTIONS = [
  'transactions',
  'settlements',
  'stockmovements',
  'cashledgers',
  'linestocktransactions',
  'linestocksettlements',
  'issuedrecords',
  'receivedinventories',
  'chittransactions',
];

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    for (const col of COLLECTIONS) {
      const result = await mongoose.connection.collection(col).deleteMany({});
      console.log(`✅ Deleted ${result.deletedCount} record(s) from [${col}]`);
    }

    console.log('\nAll transaction data cleared.');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();

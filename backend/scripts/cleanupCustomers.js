const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Load model from parent directory
const Customer = require(path.join(__dirname, '..', 'models', 'Customer'));

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // Remove orphaned docs that have no customerCode (partial failed saves)
  const orphans = await Customer.deleteMany({ customerCode: { $exists: false } });
  console.log('Removed orphaned docs (no customerCode):', orphans.deletedCount);

  // Also remove any with empty string customerCode
  const emptyCode = await Customer.deleteMany({ customerCode: '' });
  console.log('Removed docs with empty customerCode:', emptyCode.deletedCount);

  // Show remaining state
  const remaining = await Customer.find(
    {},
    { customerCode: 1, customerType: 1, customerName: 1, isActive: 1 }
  ).lean();
  console.log('Remaining docs:', JSON.stringify(remaining, null, 2));

  mongoose.disconnect();
  console.log('\nDone. You can now create new B2C customers without conflict.');
}).catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

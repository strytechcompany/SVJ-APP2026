const mongoose = require('mongoose');
require('dotenv').config();
const Stock = require('./models/Stock');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sri-vaishnavi');
};

const addStocks = async () => {
  await connectDB();
  const stocks = Array.from({length: 10}).map((_, i) => ({
    itemNumber: `ITM${1000 + i}`,
    barcode: `1000${i}`,
    itemName: ['Gold Ring', 'Gold Chain', 'Bangle', 'Necklace', 'Earrings'][i % 5],
    designName: 'Classic Design',
    category: ['Ring', 'Chain', 'Bangle', 'Necklace', 'Earring'][i % 5],
    grossWeight: 10 + i,
    netWeight: 9 + i,
    purity: '22K (916)',
    hsnCode: '7113',
    quantity: 5,
    isAvailable: true,
  }));
  await Stock.insertMany(stocks);
  console.log('10 Stocks Added');
  process.exit();
};

addStocks();

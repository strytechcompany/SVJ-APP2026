require('dotenv').config();
const mongoose = require('mongoose');

async function drop() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://dineshsurya:Dinesh%4015@sri-vaishnavi.1qjvsnm.mongodb.net/test');
  const db = mongoose.connection.db;
  try {
    await db.collection('receivedinventories').dropIndex('receiptNumber_1');
    console.log('Index dropped successfully');
  } catch (e) {
    console.log('Index drop failed or index does not exist:', e.message);
  }
  process.exit(0);
}

drop();

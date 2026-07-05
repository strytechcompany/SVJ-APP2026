const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.log('Usage: node generate-hash.js <password>');
  process.exit(1);
}

const generateHash = async () => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log(`\nPassword: ${password}`);
  console.log(`Hash: ${hash}\n`);
  console.log(`Copy the hash above into your .env file.`);
};

generateHash();

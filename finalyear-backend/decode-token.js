// Paste your JWT token from localStorage and run this script to decode it
import jwt from 'jsonwebtoken';

const token = process.argv[2];

if (!token) {
  console.log('Usage: node decode-token.js YOUR_JWT_TOKEN');
  console.log('\nTo get your token:');
  console.log('1. Open your browser DevTools (F12)');
  console.log('2. Go to Application/Storage > Local Storage');
  console.log('3. Find the "token" key and copy its value');
  console.log('4. Run: node decode-token.js YOUR_TOKEN_HERE');
  process.exit(0);
}

try {
  // Decode without verification to see what's in the token
  const decoded = jwt.decode(token);
  
  console.log('\n📋 Decoded JWT Token:');
  console.log('═'.repeat(80));
  console.log(JSON.stringify(decoded, null, 2));
  console.log('═'.repeat(80));
  
  if (decoded.exp) {
    const expirationDate = new Date(decoded.exp * 1000);
    const now = new Date();
    console.log(`\n⏰ Token expires: ${expirationDate.toLocaleString()}`);
    console.log(`⏰ Current time: ${now.toLocaleString()}`);
    console.log(`${decoded.exp * 1000 > now.getTime() ? '✅' : '❌'} Token is ${decoded.exp * 1000 > now.getTime() ? 'valid' : 'EXPIRED'}`);
  }
  
  console.log(`\n👤 User Role: ${decoded.role || 'NOT FOUND IN TOKEN'}`);
  console.log(`📧 Email: ${decoded.email || 'NOT FOUND IN TOKEN'}`);
  
} catch (error) {
  console.error('❌ Error decoding token:', error.message);
}

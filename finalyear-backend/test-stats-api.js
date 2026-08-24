import axios from 'axios';

const API_URL = 'http://localhost:5000';

async function testStatsAPI() {
  try {
    // You'll need to get a valid token from localStorage after logging in
    console.log('Testing TL Stats API...\n');
    
    // For now, let's just check if the route exists
    const response = await axios.get(`${API_URL}/api/tl-email/stats`, {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE'
      }
    });

    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.error('Error Response:', error.response.data);
      console.error('Status:', error.response.status);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Simpler check - just log what the route should return
console.log('📊 The /api/tl-email/stats route should return:');
console.log('{');
console.log('  "success": true,');
console.log('  "data": {');
console.log('    "inbox": <count>,');
console.log('    "outbox": <count>,');
console.log('    "archived": <count>,');
console.log('    "failed": <count>,');
console.log('    "unread": <count>,');
console.log('    "total": <count>');
console.log('  }');
console.log('}\n');

console.log('⚠️ To test this API:');
console.log('1. Open the browser console while logged in as a team leader');
console.log('2. Run: fetch("/api/tl-email/stats", {headers: {Authorization: `Bearer ${localStorage.getItem("token")}`}}).then(r => r.json()).then(console.log)');
console.log('\n📌 Expected result based on database check: all counts should be 0');

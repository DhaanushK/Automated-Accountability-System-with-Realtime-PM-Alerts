import axios from 'axios';

const API_BASE = 'http://localhost:5001';

async function clearCacheAndRefresh() {
  console.log('🔄 Clearing cache and forcing data refresh...\n');

  try {
    // Get authentication token (you'll need to login first)
    console.log('📡 Fetching fresh metrics data with force refresh...');
    
    const response = await axios.get(`${API_BASE}/api/metrics/all?refresh=true`, {
      headers: {
        'Authorization': `Bearer YOUR_TOKEN_HERE`, // Replace with actual token
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    console.log('\n✅ Data refreshed successfully!');
    console.log('\n📊 Team Data Summary:');
    console.log('─'.repeat(50));
    console.log(`Total team members: ${response.data.teamMembers?.length || 0}`);
    console.log(`Total metrics entries: ${response.data.allMetrics?.length || 0}`);
    
    if (response.data.aggregatedKPIs) {
      console.log('\n📈 Aggregated KPIs:');
      console.log('─'.repeat(50));
      console.log(`Total Tasks: ${response.data.aggregatedKPIs.totalTasks || 0}`);
      console.log(`Completed Tasks: ${response.data.aggregatedKPIs.completedTasks || 0}`);
      console.log(`Client Interactions: ${response.data.aggregatedKPIs.totalClientInteractions || 0}`);
      console.log(`Completion Rate: ${response.data.aggregatedKPIs.completionRate || 0}%`);
    }

    if (response.data.individualKPIs) {
      console.log('\n👥 Individual Team Member KPIs:');
      console.log('─'.repeat(50));
      Object.entries(response.data.individualKPIs).forEach(([member, kpis]) => {
        console.log(`\n${member}:`);
        console.log(`  - Total Tasks: ${kpis.totalTasks || 0}`);
        console.log(`  - Completed: ${kpis.completedTasks || 0}`);
        console.log(`  - Client Interactions: ${kpis.totalClientInteractions || 0}`);
        console.log(`  - Completion Rate: ${kpis.completionRate || 0}%`);
      });
    }

    console.log('\n' + '─'.repeat(50));
    console.log('✅ Cache cleared and data refreshed!');
    console.log('🔄 Please refresh your PM Dashboard to see updated data.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.response?.status === 401) {
      console.log('\n⚠️  Authentication required!');
      console.log('Please update the token in this script or test the endpoint directly:\n');
      console.log(`GET ${API_BASE}/api/metrics/all?refresh=true`);
      console.log('Authorization: Bearer YOUR_TOKEN\n');
    } else {
      console.log('\nMake sure:');
      console.log('1. Backend server is running on http://localhost:5001');
      console.log('2. You have proper authentication');
      console.log('3. Google Sheets API is accessible\n');
    }
  }
}

// Alternative: Direct backend test (no auth needed - for debugging)
async function testBackendDirectly() {
  console.log('🧪 Testing backend metrics endpoint...\n');
  
  try {
    const response = await axios.get(`${API_BASE}/`, { timeout: 5000 });
    console.log('✅ Backend is running:', response.data);
    console.log('\n📌 To test metrics endpoint, you need to:');
    console.log('1. Login to get your JWT token');
    console.log('2. Add the token to this script');
    console.log('3. Run: node clear-cache.js\n');
  } catch (error) {
    console.error('❌ Backend not reachable:', error.message);
    console.log('\n⚠️  Please start the backend server:');
    console.log('cd finalyear-backend');
    console.log('npm start\n');
  }
}

// Run the test
const args = process.argv.slice(2);
if (args.includes('--test')) {
  testBackendDirectly();
} else if (args.includes('--help')) {
  console.log(`
📖 Cache Clear & Refresh Tool

Usage:
  node clear-cache.js              - Clear cache and refresh data (requires auth token)
  node clear-cache.js --test       - Test if backend is running
  node clear-cache.js --help       - Show this help

To get your auth token:
  1. Login to the app in your browser
  2. Open Developer Tools (F12)
  3. Go to Application > Local Storage
  4. Copy the 'token' value
  5. Replace YOUR_TOKEN_HERE in this script with your actual token

Then run: node clear-cache.js
  `);
} else {
  clearCacheAndRefresh();
}

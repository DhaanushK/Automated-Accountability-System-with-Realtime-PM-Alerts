import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { sheets } from '../services/googleSheets.js';

const router = express.Router();

// Get current user's details
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all team members
router.get('/team-members', authMiddleware, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const teamMembers = await User.find({ role: 'team_member' })
      .select('name email')
      .sort({ name: 1 });
    
    res.json({ 
      success: true, 
      teamMembers: teamMembers.map(member => ({
        name: member.name,
        email: member.email
      }))
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get all users (team leads and team members) for calendar invites
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const users = await User.find({ 
      role: { $in: ['team_lead', 'team_member'] } 
    })
      .select('name email role')
      .sort({ role: -1, name: 1 }); // Sort by role (team_lead first), then by name
    
    res.json({ 
      success: true, 
      users: users.map(user => ({
        name: user.name,
        email: user.email,
        role: user.role
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get sheet gid by sheet name
router.get('/sheet-gid', authMiddleware, async (req, res) => {
  try {
    const { sheetName } = req.query;
    
    if (!sheetName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sheet name is required' 
      });
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    
    console.log(`Looking for sheet gid for: "${sheetName}"`);
    
    // Fetch spreadsheet metadata
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });

    if (!spreadsheet.data || !spreadsheet.data.sheets) {
      throw new Error('Invalid spreadsheet structure');
    }

    // Find the sheet by name (exact match or case-insensitive)
    let matchedSheet = null;
    
    for (const sheet of spreadsheet.data.sheets) {
      const title = sheet.properties.title;
      
      // Try exact match first
      if (title === sheetName) {
        matchedSheet = sheet;
        break;
      }
      
      // Try case-insensitive match
      if (title.toLowerCase() === sheetName.toLowerCase()) {
        matchedSheet = sheet;
        break;
      }
    }

    if (!matchedSheet) {
      console.log(`Sheet "${sheetName}" not found`);
      console.log('Available sheets:', spreadsheet.data.sheets.map(s => s.properties.title).join(', '));
      
      return res.status(404).json({ 
        success: false, 
        message: `Sheet "${sheetName}" not found in spreadsheet`,
        availableSheets: spreadsheet.data.sheets.map(s => s.properties.title)
      });
    }

    const gid = matchedSheet.properties.sheetId;
    console.log(`Found sheet "${matchedSheet.properties.title}" with gid: ${gid}`);

    res.json({ 
      success: true, 
      sheetName: matchedSheet.properties.title,
      gid: gid,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`
    });

  } catch (error) {
    console.error('Error fetching sheet gid:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get sheet data for the logged-in user
router.get('/sheet-data', authMiddleware, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id).select('name');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const sheetName = user.name; // Use the user's full name as sheet name
    
    console.log(`Fetching sheet data for user: "${sheetName}"`);

    // Fetch all data from the user's sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `'${sheetName}'!A:Z`, // Get all columns (A to Z)
    });

    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      return res.json({ 
        success: true, 
        sheetName: sheetName,
        headers: [],
        data: [],
        message: 'No data found in your sheet'
      });
    }

    // First row is headers
    const headers = rows[0];
    const data = rows.slice(1); // All data rows after headers

    res.json({ 
      success: true, 
      sheetName: sheetName,
      headers: headers,
      data: data,
      totalRows: data.length
    });

  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

export default router;
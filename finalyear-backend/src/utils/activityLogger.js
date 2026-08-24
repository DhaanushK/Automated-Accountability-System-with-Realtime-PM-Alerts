import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRENT_HEADERS = [
  'Employee Name',
  'Role',
  'Ticket No',
  'Status Before',
  'Status After',
  'Date & Time'
];

const LEGACY_HEADERS = ['Date', 'Name', 'Role', 'Event'];

class ActivityLogger {
  constructor() {
    this.logFilePath = path.join(__dirname, '../../logs/activity_log.xlsx');
    this.ensureLogFileExists();
  }

  ensureLogFileExists() {
    const logDir = path.dirname(this.logFilePath);
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      console.log('Created logs directory:', logDir);
    }

    // Create log file with headers if it doesn't exist
    if (!fs.existsSync(this.logFilePath)) {
      console.log('Creating new activity log file...');
      this.writeWorkbook([]);
      console.log('Activity log file created at:', this.logFilePath);
      return;
    }

    this.migrateLegacyWorkbookIfNeeded();
  }

  writeWorkbook(rows) {
    const worksheet = XLSX.utils.aoa_to_sheet([CURRENT_HEADERS, ...rows]);

    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 24 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Activity Log');
    XLSX.writeFile(workbook, this.logFilePath);
  }

  formatTimestamp(date = new Date()) {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  normalizeLegacyRow(row) {
    if (!row) {
      return null;
    }

    const ticketNo = this.extractTicketNoFromText(row.Event);

    return [
      row.Name || 'Unknown',
      row.Role || 'Unknown',
      ticketNo,
      'N/A',
      'N/A',
      row.Date || this.formatTimestamp()
    ];
  }

  extractTicketNoFromText(text) {
    if (!text || typeof text !== 'string') {
      return 'N/A';
    }

    const patterns = [
      /Ticket\s*No\.?\s*[:#]?\s*([A-Za-z0-9-]+)/i,
      /Ticket\s*[:#]?\s*([A-Za-z0-9-]+)/i,
      /(WG-TCK-\d+)/i,
      /\b([A-Z]{2,}-\d{3,})\b/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return 'N/A';
  }

  migrateLegacyWorkbookIfNeeded() {
    try {
      const workbook = XLSX.readFile(this.logFilePath);
      const worksheet = workbook.Sheets['Activity Log'];

      if (!worksheet) {
        this.writeWorkbook([]);
        return;
      }

      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const headers = rows[0] || [];

      if (JSON.stringify(headers) === JSON.stringify(CURRENT_HEADERS)) {
        return;
      }

      if (JSON.stringify(headers) !== JSON.stringify(LEGACY_HEADERS)) {
        return;
      }

      const migratedRows = rows
        .slice(1)
        .filter((row) => Array.isArray(row) && row.some((value) => value !== undefined && value !== ''))
        .map((row) => this.normalizeLegacyRow({
          Date: row[0],
          Name: row[1],
          Role: row[2],
          Event: row[3]
        }))
        .filter(Boolean);

      this.writeWorkbook(migratedRows);
      console.log('✅ Migrated activity log workbook to ticket-change structure');
    } catch (error) {
      console.error('❌ Error migrating activity log workbook:', error);
    }
  }

  logTicketChange(employeeName, userRole, ticketNo, statusBefore, statusAfter) {
    try {
      console.log(`Logging ticket change: ${employeeName} (${userRole}) - ${ticketNo}: ${statusBefore} -> ${statusAfter}`);
      
      const workbook = fs.existsSync(this.logFilePath)
        ? XLSX.readFile(this.logFilePath)
        : XLSX.utils.book_new();

      const worksheet = workbook.Sheets['Activity Log'];
      const data = worksheet
        ? XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        : [CURRENT_HEADERS];

      const rows = data.length > 0 && JSON.stringify(data[0]) === JSON.stringify(CURRENT_HEADERS)
        ? data
        : [CURRENT_HEADERS, ...data.slice(1).filter((row) => Array.isArray(row))];

      const newEntry = [
        employeeName || 'Unknown',
        userRole || 'Unknown',
        ticketNo || 'N/A',
        statusBefore || 'N/A',
        statusAfter || 'N/A',
        this.formatTimestamp()
      ];

      rows.push(newEntry);

      this.writeWorkbook(rows.slice(1));

      console.log(`✅ Ticket change logged successfully: ${employeeName} (${userRole})`);
      
    } catch (error) {
      console.error('❌ Error logging ticket change:', error);
      // Don't throw error to prevent breaking the main functionality
    }
  }

  // Get log file path for download
  getLogFilePath() {
    return this.logFilePath;
  }

  // Read logs from file
  readLogs() {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        return [];
      }

      const workbook = XLSX.readFile(this.logFilePath);
      const worksheet = workbook.Sheets['Activity Log'];
      if (!worksheet) {
        return [];
      }

      const logs = XLSX.utils.sheet_to_json(worksheet);

      const normalizedLogs = logs.map((log) => {
        if (Object.prototype.hasOwnProperty.call(log, 'Employee Name') || Object.prototype.hasOwnProperty.call(log, 'Status After')) {
          return {
            employeeName: log['Employee Name'] || '',
            role: log.Role || '',
            ticketNo: log['Ticket No'] || '',
            statusBefore: log['Status Before'] || '',
            statusAfter: log['Status After'] || '',
            dateTime: log['Date & Time'] || ''
          };
        }

        return {
          employeeName: log.Name || '',
          role: log.Role || '',
          ticketNo: this.extractTicketNoFromText(log.Event),
          statusBefore: 'N/A',
          statusAfter: 'N/A',
          dateTime: log.Date || ''
        };
      });

      // Sort by date/time (newest first)
      return normalizedLogs.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
      
    } catch (error) {
      console.error('Error reading activity logs:', error);
      return [];
    }
  }
}

// Export a singleton instance
const activityLogger = new ActivityLogger();
export default activityLogger;
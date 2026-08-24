import mongoose from 'mongoose';

const alertRecordSchema = new mongoose.Schema({
  alertNo: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values during creation before pre-save hook runs
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional - employee might not be in database yet
  },
  employeeName: {
    type: String,
    required: true
  },
  employeeEmail: {
    type: String,
    required: true
  },
  ticketNo: {
    type: String,
    required: true
  },
  ticketDetails: {
    date: String,
    totalTasks: Number,
    completed: Number,
    pending: Number,
    late: Number,
    hours: Number,
    incompleteFields: [String] // List of fields that are incomplete
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    required: true
  },
  noOfAlertsSent: {
    type: Number,
    default: 1
  },
  lastAlertSentAt: {
    type: Date,
    default: Date.now
  },
  alertHistory: [{
    sentAt: { type: Date, default: Date.now },
    severity: String,
    message: String,
    status: { type: String, enum: ['sent', 'delivered', 'failed'], default: 'sent' }
  }],
  status: {
    type: String,
    enum: ['Active', 'Resolved', 'Escalated'],
    default: 'Active'
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate alert number automatically before saving
alertRecordSchema.pre('save', async function(next) {
  if (this.isNew && !this.alertNo) {
    try {
      const count = await mongoose.model('AlertRecord').countDocuments();
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const sequenceNum = String(count + 1).padStart(4, '0');
      this.alertNo = `ALR-${dateStr}-${sequenceNum}`;
      console.log(`🎫 Generated alert number: ${this.alertNo}`);
    } catch (error) {
      console.error('Error generating alertNo:', error);
      // Fallback to timestamp-based ID
      this.alertNo = `ALR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
  }
  next();
});

export default mongoose.model('AlertRecord', alertRecordSchema);

import mongoose from 'mongoose';

const alertSettingsSchema = new mongoose.Schema({
  automatedAlertsEnabled: {
    type: Boolean,
    default: true
  },
  scheduleType: {
    type: String,
    enum: ['preset', 'custom'],
    default: 'preset'
  },
  customSchedule: {
    enabled: {
      type: Boolean,
      default: false
    },
    time: {
      type: String,
      default: '09:00'
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'custom'],
      default: 'daily'
    }
  },
  presetSchedule: {
    dailyMorning: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: '09:00' }
    },
    dailyEvening: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: '17:00' }
    },
    weeklyMonday: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: '10:00' }
    }
  },
  lastUpdatedBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
alertSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

alertSettingsSchema.statics.updateSettings = async function(updates, updatedBy) {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create(updates);
  } else {
    Object.assign(settings, updates);
    settings.lastUpdatedBy = updatedBy;
    await settings.save();
  }
  return settings;
};

const AlertSettings = mongoose.model('AlertSettings', alertSettingsSchema);

export default AlertSettings;

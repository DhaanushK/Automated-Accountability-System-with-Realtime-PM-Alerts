import mongoose from "mongoose";
import { isValidLocalTime, isValidReportingDate } from "../utils/reportingDate.js";

const submissionPolicySchema = new mongoose.Schema({
  policyVersion: { type: String, required: true, trim: true },
  deadlineLocalTime: {
    type: String,
    required: true,
    default: "09:30",
    validate: {
      validator: isValidLocalTime,
      message: "deadlineLocalTime must use 24-hour HH:mm format"
    }
  },
  timezone: {
    type: String,
    required: true,
    default: "Asia/Kolkata",
    validate: {
      validator: function (value) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      },
      message: "timezone must be a valid IANA timezone"
    }
  },
  workingWeekdays: {
    type: [Number],
    required: true,
    default: () => [1, 2, 3, 4, 5],
    validate: {
      validator: values =>
        values.length > 0 &&
        values.every(day => Number.isInteger(day) && day >= 1 && day <= 7) &&
        new Set(values).size === values.length,
      message: "workingWeekdays must contain unique ISO weekdays from 1 to 7"
    }
  },
  effectiveStartDate: {
    type: String,
    required: true,
    validate: {
      validator: isValidReportingDate,
      message: "effectiveStartDate must be a valid YYYY-MM-DD date"
    }
  },
  effectiveEndDate: {
    type: String,
    default: null,
    validate: {
      validator: value => value === null || isValidReportingDate(value),
      message: "effectiveEndDate must be null or a valid YYYY-MM-DD date"
    }
  },
  active: { type: Boolean, default: true }
}, {
  timestamps: true,
  strict: "throw",
  collection: "submission_policies"
});

submissionPolicySchema.pre("validate", function () {
  if (this.effectiveEndDate && this.effectiveEndDate < this.effectiveStartDate) {
    this.invalidate("effectiveEndDate", "effectiveEndDate cannot precede effectiveStartDate");
  }
});

submissionPolicySchema.index(
  { policyVersion: 1 },
  { unique: true, name: "uniq_submission_policy_version" }
);
submissionPolicySchema.index(
  { active: 1, effectiveStartDate: 1, effectiveEndDate: 1 },
  { name: "submission_policy_effectivity" }
);

export default mongoose.model("SubmissionPolicy", submissionPolicySchema);
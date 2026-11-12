import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

const submissionAlertSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  reportingDate: {
    type: String,
    required: true,
    immutable: true,
    validate: {
      validator: isValidReportingDate,
      message: "reportingDate must be a valid YYYY-MM-DD date"
    }
  },
  expectedSubmissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ExpectedSubmission",
    required: true,
    immutable: true
  },
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MetricSubmission",
    default: null
  },
  alertType: {
    type: String,
    enum: ["MISSING", "LATE_RECEIVED", "MANAGER_DIGEST"],
    required: true,
    immutable: true
  },
  triggerTimestamp: { type: Date, required: true, immutable: true },
  recipientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  acknowledgementStatus: {
    type: String,
    enum: ["Unacknowledged", "Acknowledged"],
    default: "Unacknowledged"
  },
  acknowledgedAt: { type: Date, default: null },
  resolutionStatus: {
    type: String,
    enum: ["Open", "Resolved", "Cancelled"],
    default: "Open"
  },
  resolvedAt: { type: Date, default: null },
  deliveryStatus: {
    type: String,
    enum: ["Queued", "Sending", "Sent", "Retry", "Failed"],
    default: "Queued"
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: "attempts must be an integer" }
  },
  nextAttemptAt: { type: Date, default: null },
  idempotencyKey: { type: String, required: true, immutable: true, trim: true }
}, {
  timestamps: true,
  strict: "throw",
  collection: "submission_alerts"
});

submissionAlertSchema.index(
  { idempotencyKey: 1 },
  { unique: true, name: "uniq_submission_alert_idempotency" }
);
submissionAlertSchema.index(
  { reportingDate: 1, resolutionStatus: 1 },
  { name: "submission_alert_date_resolution" }
);
submissionAlertSchema.index(
  { recipientUserId: 1, acknowledgementStatus: 1 },
  { name: "submission_alert_recipient_ack" }
);
submissionAlertSchema.index(
  { deliveryStatus: 1, nextAttemptAt: 1 },
  { name: "submission_alert_delivery_retry" }
);

export default mongoose.model("SubmissionAlert", submissionAlertSchema);

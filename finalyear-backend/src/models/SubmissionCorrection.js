import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

const correctionValuesSchema = new mongoose.Schema({
  ticketsAssigned: { type: Number, min: 0, validate: Number.isInteger },
  ticketsResolved: { type: Number, min: 0, validate: Number.isInteger },
  slaBreaches: { type: Number, min: 0, validate: Number.isInteger },
  reopenedTickets: { type: Number, min: 0, validate: Number.isInteger },
  clientInteractions: { type: Number, min: 0, validate: Number.isInteger },
  remarks: { type: String, maxlength: 1000 }
}, { _id: false, strict: "throw" });

const submissionCorrectionSchema = new mongoose.Schema({
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MetricSubmission",
    required: true,
    immutable: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  correctionTimestamp: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true
  },
  previousValues: { type: correctionValuesSchema, required: true, immutable: true },
  correctedValues: { type: correctionValuesSchema, required: true, immutable: true },
  correctionReason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
    immutable: true
  },
  approvalStatus: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending"
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  originalActualSubmittedAt: { type: Date, required: true, immutable: true },
  originalApplicableDeadlineAt: { type: Date, required: true, immutable: true },
  originalStatus: {
    type: String,
    enum: ["On-Time", "Late"],
    required: true,
    immutable: true
  }
}, {
  timestamps: true,
  strict: "throw",
  collection: "submission_corrections"
});

submissionCorrectionSchema.pre("validate", async function () {
  if (this.approvalStatus !== "Approved") {
    if (this.approvedBy || this.approvedAt) {
      this.invalidate("approvalStatus", "Only approved corrections may contain approval metadata");
    }
    return;
  }

  if (!this.approvedBy || !this.approvedAt) {
    this.invalidate("approvedBy", "Approved corrections require approver and approval time");
    return;
  }

  if (String(this.approvedBy) === String(this.modifiedBy)) {
    this.invalidate("approvedBy", "A correction cannot be approved by its modifier");
    return;
  }

  const UserModel = mongoose.model("User");
  const approver = await UserModel.findById(this.approvedBy).select("role").lean();
  if (!approver || !["team_lead", "project_manager"].includes(approver.role)) {
    this.invalidate("approvedBy", "Only an existing Team Lead or Project Manager may approve corrections");
  }
});

submissionCorrectionSchema.index(
  { submissionId: 1, correctionTimestamp: -1 },
  { name: "submission_correction_history" }
);
submissionCorrectionSchema.index(
  { employeeId: 1, correctionTimestamp: -1 },
  { name: "submission_correction_employee_history" }
);
submissionCorrectionSchema.index(
  { approvalStatus: 1, createdAt: 1 },
  { name: "submission_correction_approval_queue" }
);

export default mongoose.model("SubmissionCorrection", submissionCorrectionSchema);
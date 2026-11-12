import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

const expectedSubmissionSchema = new mongoose.Schema({
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
  expected: { type: Boolean, required: true, immutable: true },
  status: {
    type: String,
    enum: ["Pending", "On-Time", "Late", "Missing", "Excluded"],
    required: true,
    default: "Pending"
  },
  deadlineAt: { type: Date, required: true, immutable: true },
  policyVersion: { type: String, required: true, immutable: true },
  reasonCode: {
    type: String,
    enum: ["WORKDAY", "WEEKEND", "HOLIDAY", "LEAVE", "EXEMPTION", "OTHER"],
    default: null
  },
  exceptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SubmissionException",
    default: null
  },
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MetricSubmission",
    default: null
  },
  statusEvaluatedAt: { type: Date, default: null }
}, {
  timestamps: true,
  strict: "throw",
  collection: "expected_submissions"
});

expectedSubmissionSchema.pre("validate", function () {
  const submittedStatuses = ["On-Time", "Late"];
  const nonSubmittedStatuses = ["Pending", "Missing", "Excluded"];
  const hasSubmissionReference = this.submissionId != null;

  if (this.expected && this.status === "Excluded") {
    this.invalidate("status", "Expected employee-days cannot have Excluded status");
  }
  if (!this.expected && this.status !== "Excluded") {
    this.invalidate("status", "Non-expected employee-days must have Excluded status");
  }
  if (!this.expected && !this.reasonCode) {
    this.invalidate("reasonCode", "Excluded employee-days require an exclusion reason");
  }
  if (submittedStatuses.includes(this.status) && !hasSubmissionReference) {
    this.invalidate("submissionId", this.status + " records must reference a submission");
  }
  if (nonSubmittedStatuses.includes(this.status) && hasSubmissionReference) {
    this.invalidate("submissionId", this.status + " records cannot reference a submission");
  }
});

expectedSubmissionSchema.index(
  { employeeId: 1, reportingDate: 1 },
  { unique: true, name: "uniq_expected_submission_employee_date" }
);
expectedSubmissionSchema.index(
  { reportingDate: 1, status: 1 },
  { name: "expected_submission_date_status" }
);
expectedSubmissionSchema.index(
  { status: 1, deadlineAt: 1 },
  { name: "expected_submission_due_status" }
);

export default mongoose.model("ExpectedSubmission", expectedSubmissionSchema);

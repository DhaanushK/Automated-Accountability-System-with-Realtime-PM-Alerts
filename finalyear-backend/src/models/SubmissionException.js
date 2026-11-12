import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

const submissionExceptionSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  startDate: {
    type: String,
    required: true,
    validate: {
      validator: isValidReportingDate,
      message: "startDate must be a valid YYYY-MM-DD date"
    }
  },
  endDate: {
    type: String,
    required: true,
    validate: {
      validator: isValidReportingDate,
      message: "endDate must be a valid YYYY-MM-DD date"
    }
  },
  exceptionType: {
    type: String,
    enum: ["Leave", "Holiday", "Exemption"],
    required: true
  },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  approvalStatus: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    required: true,
    default: "Pending"
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  approvedAt: { type: Date, default: null }
}, {
  timestamps: true,
  strict: "throw",
  collection: "submission_exceptions"
});

submissionExceptionSchema.pre("validate", function () {
  if (this.endDate < this.startDate) {
    this.invalidate("endDate", "endDate cannot precede startDate");
  }
  if (this.exceptionType !== "Holiday" && !this.employeeId) {
    this.invalidate("employeeId", "Leave and exemptions require an employee");
  }
  if (this.approvalStatus === "Approved" && (!this.approvedBy || !this.approvedAt)) {
    this.invalidate("approvedBy", "Approved exceptions require approver and approval time");
  }
  if (this.approvalStatus !== "Approved" && (this.approvedBy || this.approvedAt)) {
    this.invalidate("approvalStatus", "Only approved exceptions may contain approval metadata");
  }
});

submissionExceptionSchema.index(
  { employeeId: 1, startDate: 1, endDate: 1, approvalStatus: 1 },
  { name: "submission_exception_employee_range_status" }
);
submissionExceptionSchema.index(
  { exceptionType: 1, startDate: 1, endDate: 1, approvalStatus: 1 },
  { name: "submission_exception_calendar_range" }
);

export default mongoose.model("SubmissionException", submissionExceptionSchema);

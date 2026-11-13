import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

const employeeReportingAssignmentSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  teamLeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },
  teamId: {
    type: String,
    required: true,
    trim: true,
    immutable: true
  },
  effectiveStartDate: {
    type: String,
    required: true,
    immutable: true,
    validate: {
      validator: isValidReportingDate,
      message: "effectiveStartDate must be a valid YYYY-MM-DD date"
    }
  },
  effectiveEndDate: {
    type: String,
    default: null,
    validate: {
      validator: value =>
        value === null || isValidReportingDate(value),
      message: "effectiveEndDate must be null or a valid YYYY-MM-DD date"
    }
  },
  assignmentType: {
    type: String,
    enum: ["INITIAL", "TRANSFER"],
    required: true,
    immutable: true
  },
  sourceType: {
    type: String,
    enum: ["SIMULATED_ROSTER", "VERIFIED_SOURCE"],
    required: true,
    immutable: true
  },
  sourceReference: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null,
    immutable: true
  }
}, {
  timestamps: true,
  strict: "throw",
  collection: "employee_reporting_assignments",
  autoCreate: false,
  autoIndex: false
});

employeeReportingAssignmentSchema.pre("validate", function () {
  if (
    this.effectiveEndDate &&
    this.effectiveEndDate < this.effectiveStartDate
  ) {
    this.invalidate(
      "effectiveEndDate",
      "effectiveEndDate cannot precede effectiveStartDate"
    );
  }

  if (this.sourceType === "VERIFIED_SOURCE" && !this.sourceReference) {
    this.invalidate(
      "sourceReference",
      "Verified assignments require a source reference"
    );
  }
});

employeeReportingAssignmentSchema.index(
  { employeeId: 1, effectiveStartDate: 1 },
  {
    unique: true,
    name: "uniq_employee_assignment_start"
  }
);

employeeReportingAssignmentSchema.index(
  { teamLeadId: 1, teamId: 1, effectiveStartDate: -1 },
  { name: "team_lead_assignment_history" }
);

export default mongoose.model(
  "EmployeeReportingAssignment",
  employeeReportingAssignmentSchema
);

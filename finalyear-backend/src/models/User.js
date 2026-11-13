import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  employeeCode: {
  type: String,
  trim: true,
  uppercase: true,
  default: undefined,
  validate: {
    validator: value =>
      value === undefined ||
      value === null ||
      /^[A-Z]{2,4}-\d{3,6}$/.test(value),
    message: "employeeCode must follow the format EMP-001"
  }
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["team_member", "team_lead", "project_manager"],
    required: true
  },

  // Roster metadata is optional and does not change current authentication behavior.
  active: { type: Boolean, default: false },
  teamId: { type: String, trim: true, default: null },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  employmentStartDate: {
    type: String,
    default: null,
    validate: {
      validator: value => value === null || isValidReportingDate(value),
      message: "employmentStartDate must be a valid YYYY-MM-DD date"
    }
  },
  assignmentRevision: {
  type: Number,
  default: 0,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "assignmentRevision must be a safe integer"
  }
  },
  employmentEndDate: {
    type: String,
    default: null,
    validate: {
      validator: function (value) {
        return value === null ||
          (isValidReportingDate(value) &&
            (!this.employmentStartDate || value >= this.employmentStartDate));
      },
      message: "employmentEndDate must be valid and not precede employmentStartDate"
    }
  }
});

export default mongoose.model("User", userSchema);
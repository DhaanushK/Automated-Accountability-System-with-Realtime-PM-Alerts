import mongoose from "mongoose";
import { isValidReportingDate } from "../utils/reportingDate.js";

const metricValuesSchema = new mongoose.Schema({
  ticketsAssigned: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isInteger, message: "ticketsAssigned must be an integer" }
  },
  ticketsResolved: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isInteger, message: "ticketsResolved must be an integer" }
  },
  slaBreaches: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isInteger, message: "slaBreaches must be an integer" }
  },
  reopenedTickets: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isInteger, message: "reopenedTickets must be an integer" }
  },
  clientInteractions: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isInteger, message: "clientInteractions must be an integer" }
  },
  remarks: { type: String, default: "", maxlength: 1000 }
}, { _id: false, strict: "throw" });

const metricSubmissionSchema = new mongoose.Schema({
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
  actualSubmittedAt: { type: Date, required: true, immutable: true },
  applicableDeadlineAt: { type: Date, required: true, immutable: true },
  status: {
    type: String,
    enum: ["On-Time", "Late"],
    required: true,
    immutable: true
  },
  metrics: { type: metricValuesSchema, required: true },
  policyVersion: { type: String, required: true, immutable: true }
}, {
  timestamps: true,
  strict: "throw",
  collection: "metric_submissions"
});

metricSubmissionSchema.index(
  { employeeId: 1, reportingDate: 1 },
  { unique: true, name: "uniq_metric_submission_employee_date" }
);
metricSubmissionSchema.index(
  { reportingDate: 1, status: 1 },
  { name: "metric_submission_date_status" }
);
metricSubmissionSchema.index(
  { employeeId: 1, reportingDate: -1 },
  { name: "metric_submission_employee_history" }
);

export default mongoose.model("MetricSubmission", metricSubmissionSchema);

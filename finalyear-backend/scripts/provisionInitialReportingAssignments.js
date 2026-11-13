import mongoose from "mongoose";

import User from "../src/models/User.js";

import EmployeeReportingAssignment from
  "../src/models/EmployeeReportingAssignment.js";

import {
  setupIntegrationDatabase,
  getVerifiedIntegrationIdentity
} from "../test/support/mongoIntegration.js";

import {
  createInitialEmployeeReportingAssignment
} from "../src/services/employeeReportingAssignmentWriteService.js";

const APPLY = process.argv.includes("--apply");

if (process.argv.slice(2).some(arg => arg !== "--apply") ||
    process.argv.filter(arg => arg === "--apply").length > 1) {
  throw new Error("Only the optional --apply argument is supported.");
}

const START_DATE = "2026-10-11";
const SOURCE_REFERENCE = "SYNTHETIC_ROSTER_2026-10-11";

const ROSTER = [
  { employeeCode: "EMP-001", teamLeadCode: "TL-001", teamId: "TEAM-ALPHA" },
  { employeeCode: "EMP-002", teamLeadCode: "TL-001", teamId: "TEAM-ALPHA" },
  { employeeCode: "EMP-003", teamLeadCode: "TL-001", teamId: "TEAM-ALPHA" },
  { employeeCode: "EMP-004", teamLeadCode: "TL-002", teamId: "TEAM-BETA" },
  { employeeCode: "EMP-005", teamLeadCode: "TL-002", teamId: "TEAM-BETA" },
  { employeeCode: "EMP-006", teamLeadCode: "TL-002", teamId: "TEAM-BETA" }
];

function sameId(left, right) {
  return left != null && right != null &&
    String(left) === String(right);
}

function isExactAssignment(record, employee, teamLead, teamId) {
  return (
    sameId(record.employeeId, employee._id) &&
    sameId(record.teamLeadId, teamLead._id) &&
    record.teamId === teamId &&
    record.effectiveStartDate === START_DATE &&
    record.effectiveEndDate == null &&
    record.assignmentType === "INITIAL" &&
    record.sourceType === "SIMULATED_ROSTER" &&
    record.sourceReference === SOURCE_REFERENCE
  );
}

async function verifyRoster() {
  const codes = [
    "PM-001", "TL-001", "TL-002",
    ...ROSTER.map(item => item.employeeCode)
  ];

  const users = await User.find({
    employeeCode: { $in: codes }
  })
    .select("_id employeeCode role teamId managerId active employmentStartDate employmentEndDate")
    .lean();

  if (users.length !== 9) {
    throw new Error("Expected exactly nine synthetic roster accounts.");
  }

  const byCode = new Map(users.map(user => [user.employeeCode, user]));

  if (byCode.size !== 9 || codes.some(code => !byCode.has(code))) {
    throw new Error("Synthetic account identities are missing or duplicated.");
  }

  const pm = byCode.get("PM-001");
  if (
    pm.role !== "project_manager" ||
    pm.teamId != null ||
    pm.managerId != null
  ) {
    throw new Error("PM-001 account verification failed.");
  }

  for (const [code, teamId] of [
    ["TL-001", "TEAM-ALPHA"],
    ["TL-002", "TEAM-BETA"]
  ]) {
    const lead = byCode.get(code);

    if (
      lead.role !== "team_lead" ||
      lead.teamId !== teamId
    ) {
      throw new Error(`Team Lead verification failed: ${code}`);
    }
  }

  for (const user of users) {
    if (
      user.active !== false ||
      user.employmentStartDate !== START_DATE ||
      user.employmentEndDate != null
    ) {
      throw new Error(
        `Synthetic account employment-state verification failed: ${user.employeeCode}`
      );
    }
  }

  for (const item of ROSTER) {
    const employee = byCode.get(item.employeeCode);
    const lead = byCode.get(item.teamLeadCode);

    if (
      employee.role !== "team_member" ||
      employee.teamId !== item.teamId ||
      !sameId(employee.managerId, lead._id)
    ) {
      throw new Error(
        `Reporting relationship verification failed: ${item.employeeCode}`
      );
    }
  }

  return byCode;
}

async function inspectExistingAssignments(byCode) {
  const employeeIds = ROSTER.map(
    item => byCode.get(item.employeeCode)._id
  );

  const existing = await EmployeeReportingAssignment.find({
    employeeId: { $in: employeeIds }
  }).lean();

  const plans = [];

  for (const item of ROSTER) {
    const employee = byCode.get(item.employeeCode);
    const lead = byCode.get(item.teamLeadCode);

    const records = existing.filter(
      record => sameId(record.employeeId, employee._id)
    );

    const exact = records.find(record =>
      isExactAssignment(record, employee, lead, item.teamId)
    );

    if (exact) {
      if (records.length !== 1) {
        throw new Error(
          `Unexpected additional assignment records for ${item.employeeCode}.`
        );
      }

      plans.push({
        ...item,
        employee,
        lead,
        action: "REPLAY"
      });

      continue;
    }

    const overlap = records.some(record =>
      record.effectiveEndDate == null ||
      record.effectiveEndDate >= START_DATE
    );

    if (overlap) {
      throw new Error(
        `Conflicting or overlapping assignment exists for ${item.employeeCode}.`
      );
    }

    plans.push({
      ...item,
      employee,
      lead,
      action: "CREATE"
    });
  }

  return plans;
}

async function run() {
  try {
    const connection = await setupIntegrationDatabase();

    const identity = getVerifiedIntegrationIdentity(connection);

    console.log("=== GUARDED INITIAL ASSIGNMENT PROVISIONING ===");
    console.log("Database:", identity.databaseName);
    console.log("Host:", identity.host + ":" + identity.port);
    console.log("Replica set:", identity.replicaSetName);
    console.log("Mode:", APPLY ? "EXPLICIT APPLY" : "DRY RUN");

    if (
      User.db !== connection ||
      EmployeeReportingAssignment.db !== connection
    ) {
      throw new Error("Models are not bound to the verified connection.");
    }

    const byCode = await verifyRoster();
    console.log("Synthetic roster verification: PASSED (9 accounts)");

    const plans = await inspectExistingAssignments(byCode);

    console.log("\nINITIAL ASSIGNMENT PLAN");

    for (const plan of plans) {
      console.log(
        `${plan.employeeCode} -> ${plan.teamLeadCode} (${plan.teamId}): ${plan.action}`
      );
    }

    console.log("\nExpected assignment date:", START_DATE);
    console.log("Source:", SOURCE_REFERENCE);

    if (!APPLY) {
      console.log("\nDRY RUN COMPLETE. No database modifications performed.");
      return;
    }

    let created = 0;
    let replayed = 0;

    for (const plan of plans) {
      if (plan.action === "REPLAY") {
        replayed++;
        console.log("Already verified:", plan.employeeCode);
        continue;
      }

      const result = await createInitialEmployeeReportingAssignment({
        employeeId: plan.employee._id,
        teamLeadId: plan.lead._id
      });

      if (!result?.success || !result?.data?.assignmentId) {
        throw new Error(
          `Assignment result verification failed: ${plan.employeeCode}`
        );
      }

      if (result.data.isReplay) {
        replayed++;
      } else {
        created++;
      }

      console.log(
        result.data.isReplay ? "Reconciled:" : "Created and verified:",
        plan.employeeCode
      );
    }

    console.log("\nPROVISIONING COMPLETE");
    console.log("Created during this run:", created);
    console.log("Already present or replayed:", replayed);
    console.log("Total verified:", created + replayed);
    console.log("No account activation or ExpectedSubmission creation performed.");

  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

run().catch(error => {
  console.error("PROVISIONING FAILED:", error.message);
  process.exitCode = 1;
});

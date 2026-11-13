const expectedDb = "accountability_app_integration_test";

if (db.getName() !== expectedDb) {
  throw new Error("Unexpected database.");
}

const hello = db.adminCommand({ hello: 1 });

if (
  hello.setName !== "accountabilityTestRS" ||
  hello.me !== "127.0.0.1:27018"
) {
  throw new Error("Unexpected MongoDB server.");
}

const employees = db.users.find({
  employeeCode: {
    $in: [
      "EMP-001", "EMP-002", "EMP-003",
      "EMP-004", "EMP-005", "EMP-006"
    ]
  }
}).toArray();

if (employees.length !== 6) {
  throw new Error("Expected six synthetic employees.");
}

const employeeIds = employees.map(user => user._id);

const assignments = db.employee_reporting_assignments.find({
  employeeId: { $in: employeeIds }
}).toArray();

const expected = {
  "EMP-001": ["TL-001", "TEAM-ALPHA"],
  "EMP-002": ["TL-001", "TEAM-ALPHA"],
  "EMP-003": ["TL-001", "TEAM-ALPHA"],
  "EMP-004": ["TL-002", "TEAM-BETA"],
  "EMP-005": ["TL-002", "TEAM-BETA"],
  "EMP-006": ["TL-002", "TEAM-BETA"]
};

const leads = db.users.find({
  employeeCode: { $in: ["TL-001", "TL-002"] }
}).toArray();

const leadIds = Object.fromEntries(
  leads.map(lead => [lead.employeeCode, lead._id.toString()])
);

if (leads.length !== 2) {
  throw new Error("Expected two synthetic Team Leads.");
}

const results = [];

for (const employee of employees) {
  const assignment = assignments.find(
    item => item.employeeId.equals(employee._id)
  );

  if (!assignment) {
    throw new Error(`Assignment missing: ${employee.employeeCode}`);
  }

  const [leadCode, teamId] = expected[employee.employeeCode];

  const valid =
    assignment.teamLeadId.toString() === leadIds[leadCode] &&
    assignment.teamId === teamId &&
    assignment.effectiveStartDate === "2026-10-11" &&
    assignment.effectiveEndDate === null &&
    assignment.assignmentType === "INITIAL" &&
    assignment.sourceType === "SIMULATED_ROSTER" &&
    assignment.sourceReference === "SYNTHETIC_ROSTER_2026-10-11";

  if (!valid) {
    throw new Error(`Assignment mismatch: ${employee.employeeCode}`);
  }

  results.push({
    employee: employee.employeeCode,
    teamLead: leadCode,
    team: teamId,
    effectiveStartDate: assignment.effectiveStartDate,
    status: "VERIFIED"
  });
}

if (assignments.length !== 6) {
  throw new Error("Unexpected assignment count.");
}

print("=== INDEPENDENT ASSIGNMENT VERIFICATION ===");
print("Database:", db.getName());
print("Verified assignments:", assignments.length);
printjson(results);
print("RESULT: ALL SIX ASSIGNMENTS VERIFIED");

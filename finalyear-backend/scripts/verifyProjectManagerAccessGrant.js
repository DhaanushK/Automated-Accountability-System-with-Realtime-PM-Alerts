
const EXPECTED_DATABASE = "accountability_app_integration_test";
const GRANT_ID = "6af7093dd28f206fdf1638a1";
const EMPLOYEE_CODE = "PM-001";

if (db.getName() !== EXPECTED_DATABASE) {
  throw new Error("Unexpected database. Verification stopped.");
}

const users = db.users.find({
  employeeCode: EMPLOYEE_CODE
}).toArray();

if (users.length !== 1) {
  throw new Error("Expected exactly one PM-001 account.");
}

const user = users[0];

if (
  user.role !== "project_manager" ||
  user.active !== false
) {
  throw new Error("PM-001 account state verification failed.");
}

const grant = db.submission_access_grants.findOne({
  _id: ObjectId(GRANT_ID)
});

if (!grant) {
  throw new Error("Expected grant document was not found.");
}

if (
  grant.userId.toString() !== user._id.toString() ||
  grant.scope !== "ORGANIZATION" ||
  grant.active !== true ||
  grant.grantedBy != null ||
  grant.grantSource !== "SIMULATED_AUTHORIZATION" ||
  grant.grantReason !==
    "Synthetic test authorization for integration testing" ||
  grant.provisioningRunId !==
    "SYNTHETIC_PM_ORG_ACCESS_2026-11-13" ||
  grant.revokedBy != null ||
  grant.revokedAt != null ||
  grant.revocationReason != null
) {
  throw new Error("Persisted grant verification failed.");
}

const activeGrantCount = db.submission_access_grants.countDocuments({
  userId: user._id,
  scope: "ORGANIZATION",
  active: true
});

if (activeGrantCount !== 1) {
  throw new Error("Unexpected active organization grant count.");
}

print("=== INDEPENDENT PM GRANT VERIFICATION ===");
print("Database:", EXPECTED_DATABASE);
print("Employee:", EMPLOYEE_CODE);
print("Role:", user.role);
print("Account active:", user.active);
print("Grant ID:", grant._id);
print("Scope:", grant.scope);
print("Grant source:", grant.grantSource);
print("Granted by:", grant.grantedBy);
print("Grant active:", grant.active);
print("Active organization grants:", activeGrantCount);
print("RESULT: PM-001 GRANT VERIFIED");
print("RESULT: ACCOUNT REMAINS INACTIVE");

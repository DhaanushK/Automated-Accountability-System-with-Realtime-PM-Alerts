
import mongoose from "mongoose";

import User from "../src/models/User.js";
import SubmissionAccessGrant from
  "../src/models/SubmissionAccessGrant.js";

import {
  setupIntegrationDatabase,
  getVerifiedIntegrationIdentity
} from "../test/support/mongoIntegration.js";

import {
  createOrganizationAccessGrant
} from "../src/services/submissionAccessGrantService.js";

const APPLY = process.argv.includes("--apply");

if (
  process.argv.slice(2).some(arg => arg !== "--apply") ||
  process.argv.filter(arg => arg === "--apply").length > 1
) {
  throw new Error("Only the optional --apply argument is supported.");
}

const TARGET_EMPLOYEE_CODE = "PM-001";

const GRANT_SCOPE = "ORGANIZATION";
const GRANT_SOURCE = "SIMULATED_AUTHORIZATION";

const GRANT_REASON =
  "Synthetic test authorization for integration testing";

const PROVISIONING_RUN_ID =
  "SYNTHETIC_PM_ORG_ACCESS_2026-11-13";

function sameId(left, right) {
  return left != null &&
    right != null &&
    String(left) === String(right);
}

function isExactGrant(grant, user) {
  return (
    sameId(grant.userId, user._id) &&
    grant.scope === GRANT_SCOPE &&
    grant.active === true &&
    grant.grantedBy == null &&
    grant.grantReason === GRANT_REASON &&
    grant.grantSource === GRANT_SOURCE &&
    grant.provisioningRunId === PROVISIONING_RUN_ID &&
    grant.revokedBy == null &&
    grant.revokedAt == null &&
    grant.revocationReason == null
  );
}

async function verifyProjectManager() {
  const users = await User.find({
    employeeCode: TARGET_EMPLOYEE_CODE
  })
    .select(
      "_id employeeCode role active teamId managerId employmentStartDate employmentEndDate"
    )
    .lean();

  if (users.length !== 1) {
    throw new Error(
      "Expected exactly one PM-001 account."
    );
  }

  const projectManager = users[0];

  if (
    projectManager.employeeCode !== TARGET_EMPLOYEE_CODE ||
    projectManager.role !== "project_manager" ||
    projectManager.active !== false ||
    projectManager.teamId != null ||
    projectManager.managerId != null ||
    projectManager.employmentStartDate !== "2026-10-11" ||
    projectManager.employmentEndDate != null
  ) {
    throw new Error(
      "PM-001 synthetic account verification failed."
    );
  }

  return projectManager;
}

async function inspectExistingGrants(projectManager) {
  const existingGrants = await SubmissionAccessGrant.find({
    userId: projectManager._id,
    scope: GRANT_SCOPE
  })
    .select(
      "_id userId scope active grantedBy grantedAt grantReason grantSource provisioningRunId revokedBy revokedAt revocationReason"
    )
    .lean();

  const activeGrants = existingGrants.filter(
    grant => grant.active === true
  );

  const revokedGrants = existingGrants.filter(
    grant => grant.active === false
  );

  if (activeGrants.length > 1) {
    throw new Error(
      "Multiple active organization grants detected. Manual review required."
    );
  }

  for (const grant of revokedGrants) {
    if (
      !(grant.revokedAt instanceof Date) ||
      Number.isNaN(grant.revokedAt.getTime()) ||
      typeof grant.revocationReason !== "string" ||
      !grant.revocationReason.trim()
    ) {
      throw new Error(
        "Invalid historical revocation metadata detected. Manual review required."
      );
    }
  }

  if (activeGrants.length === 1) {
    if (!isExactGrant(activeGrants[0], projectManager)) {
      throw new Error(
        "A conflicting active organization grant already exists."
      );
    }

    return {
      action: "REPLAY",
      existingCount: existingGrants.length,
      revokedCount: revokedGrants.length,
      grant: activeGrants[0]
    };
  }

  return {
    action: "CREATE",
    existingCount: existingGrants.length,
    revokedCount: revokedGrants.length,
    grant: null
  };
}

async function verifyCreatedGrant(grantId, projectManager) {
  const grant = await SubmissionAccessGrant.findOne({
    _id: new mongoose.Types.ObjectId(grantId),
    userId: projectManager._id,
    scope: GRANT_SCOPE,
    active: true
  }).lean();

  if (!grant || !isExactGrant(grant, projectManager)) {
    throw new Error(
      "Created organization grant failed independent verification."
    );
  }

  return grant;
}

async function run() {
  try {
    const connection = await setupIntegrationDatabase();

    const identity = getVerifiedIntegrationIdentity(connection);

    console.log("=== GUARDED PROJECT MANAGER GRANT PROVISIONING ===");
    console.log("Database:", identity.databaseName);
    console.log("Host:", identity.host + ":" + identity.port);
    console.log("Replica set:", identity.replicaSetName);
    console.log("Mode:", APPLY ? "EXPLICIT APPLY" : "DRY RUN");

    if (
      User.db !== connection ||
      SubmissionAccessGrant.db !== connection
    ) {
      throw new Error(
        "Models are not bound to the verified connection."
      );
    }

    const projectManager = await verifyProjectManager();

    console.log("PM-001 account verification: PASSED");
    console.log("Role:", projectManager.role);
    console.log("Account active:", projectManager.active);

    const plan = await inspectExistingGrants(projectManager);

    console.log("\nORGANIZATION GRANT PLAN");
    console.log("Target:", TARGET_EMPLOYEE_CODE);
    console.log("Scope:", GRANT_SCOPE);
    console.log("Grant source:", GRANT_SOURCE);
    console.log("Grant reason:", GRANT_REASON);
    console.log("Provisioning run:", PROVISIONING_RUN_ID);
    console.log("Granted by: null");
    console.log("Existing grant history:", plan.existingCount);
    console.log("Previously revoked grants:", plan.revokedCount);
    console.log("Action:", plan.action);

    if (!APPLY) {
      console.log(
        "\nDRY RUN COMPLETE. No database modifications performed."
      );
      return;
    }

    if (plan.action === "REPLAY") {
      console.log("\nGRANT ALREADY VERIFIED");
      console.log("Grant ID:", String(plan.grant._id));
      console.log("No new grant document created.");
      return;
    }

    const result = await createOrganizationAccessGrant({
      userId: String(projectManager._id),
      grantReason: GRANT_REASON,
      grantSource: GRANT_SOURCE,
      provisioningRunId: PROVISIONING_RUN_ID,
      grantedBy: null,
      models: {
        UserModel: User,
        SubmissionAccessGrantModel: SubmissionAccessGrant
      }
    });

    if (
      !result?.grantId ||
      result.userId !== String(projectManager._id) ||
      result.scope !== GRANT_SCOPE ||
      result.active !== true
    ) {
      throw new Error(
        "Grant service returned an unexpected result."
      );
    }

    const verified = await verifyCreatedGrant(
      result.grantId,
      projectManager
    );

    console.log("\nPROVISIONING COMPLETE");
    console.log("Created and verified: PM-001");
    console.log("Grant ID:", String(verified._id));
    console.log("Scope:", verified.scope);
    console.log("Grant source:", verified.grantSource);
    console.log("Granted by:", verified.grantedBy);
    console.log("Active grant:", verified.active);

    console.log(
      "PM-001 account remains inactive."
    );

    console.log(
      "No account activation or ExpectedSubmission creation performed."
    );

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

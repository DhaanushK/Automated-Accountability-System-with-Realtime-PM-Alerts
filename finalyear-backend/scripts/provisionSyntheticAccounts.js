
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import {
  setupIntegrationDatabase,
  teardownIntegrationDatabase,
  getVerifiedIntegrationIdentity
} from "../test/support/mongoIntegration.js";

import User from "../src/models/User.js";

const EMPLOYMENT_START_DATE = "2026-10-11";
const BCRYPT_ROUNDS = 10;
const APPLY = process.argv.includes("--apply");

const unexpectedArguments = process.argv
  .slice(2)
  .filter(argument => argument !== "--apply");

if (unexpectedArguments.length > 0) {
  throw new Error("Unsupported argument. Only --apply is accepted.");
}

const ACCOUNT_ROSTER = [
  {
    employeeCode: "PM-001",
    name: "Project Manager 01",
    email: "pm-001@accountability.invalid",
    role: "project_manager",
    teamId: null,
    managerCode: null
  },
  {
    employeeCode: "TL-001",
    name: "Team Lead 01",
    email: "tl-001@accountability.invalid",
    role: "team_lead",
    teamId: "TEAM-ALPHA",
    managerCode: null
  },
  {
    employeeCode: "TL-002",
    name: "Team Lead 02",
    email: "tl-002@accountability.invalid",
    role: "team_lead",
    teamId: "TEAM-BETA",
    managerCode: null
  },
  ...[1, 2, 3, 4, 5, 6].map(number => {
    const employeeCode = `EMP-${String(number).padStart(3, "0")}`;
    const teamNumber = number <= 3 ? 1 : 2;

    return {
      employeeCode,
      name: `Team Member ${String(number).padStart(2, "0")}`,
      email: `${employeeCode.toLowerCase()}@accountability.invalid`,
      role: "team_member",
      teamId: teamNumber === 1 ? "TEAM-ALPHA" : "TEAM-BETA",
      managerCode: teamNumber === 1 ? "TL-001" : "TL-002"
    };
  })
];

function isBcryptHash(value) {
  return typeof value === "string" &&
    /^\$2[aby]\$\d{2}\$/.test(value);
}

function getIdentityMaps(accounts) {
  const byCode = new Map();
  const byEmail = new Map();

  for (const account of accounts) {
    if (account.employeeCode) {
      const matches = byCode.get(account.employeeCode) || [];
      matches.push(account);
      byCode.set(account.employeeCode, matches);
    }

    if (account.email) {
      const matches = byEmail.get(account.email) || [];
      matches.push(account);
      byEmail.set(account.email, matches);
    }
  }

  return { byCode, byEmail };
}

function verifyExistingAccount(expected, actual, manager) {
  const problems = [];

  if (actual.employeeCode !== expected.employeeCode) {
    problems.push("employeeCode mismatch");
  }

  if (actual.email !== expected.email) {
    problems.push("email mismatch");
  }

  if (actual.name !== expected.name) {
    problems.push("name mismatch");
  }

  if (actual.role !== expected.role) {
    problems.push("role mismatch");
  }

  if (actual.active !== false) {
    problems.push("account is not inactive");
  }

  if ((actual.teamId ?? null) !== expected.teamId) {
    problems.push("teamId mismatch");
  }

  if (actual.employmentStartDate !== EMPLOYMENT_START_DATE) {
    problems.push("employmentStartDate mismatch");
  }

  if (actual.employmentEndDate !== null) {
    problems.push("employmentEndDate mismatch");
  }

  if (!isBcryptHash(actual.password)) {
    problems.push("password hash missing or invalid");
  }

  if (expected.managerCode) {
    if (!manager) {
      problems.push("expected manager account is missing");
    } else if (
      String(actual.managerId ?? "") !== String(manager._id)
    ) {
      problems.push("managerId mismatch");
    }
  } else if (actual.managerId != null) {
    problems.push("unexpected managerId");
  }

  return problems;
}

async function loadExistingAccounts() {
  return User.find({
    $or: [
      {
        employeeCode: {
          $in: ACCOUNT_ROSTER.map(account => account.employeeCode)
        }
      },
      {
        email: {
          $in: ACCOUNT_ROSTER.map(account => account.email)
        }
      }
    ]
  })
    .select("+password")
    .lean();
}

function inspectRoster(existingAccounts) {
  const { byCode, byEmail } = getIdentityMaps(existingAccounts);

  const missing = [];
  const verified = [];
  const conflicts = [];

  const verifiedByCode = new Map();

  for (const expected of ACCOUNT_ROSTER) {
    const codeMatches = byCode.get(expected.employeeCode) || [];
    const emailMatches = byEmail.get(expected.email) || [];

    if (codeMatches.length === 0 && emailMatches.length === 0) {
      missing.push(expected);
      continue;
    }

    if (
      codeMatches.length !== 1 ||
      emailMatches.length !== 1 ||
      String(codeMatches[0]?._id) !== String(emailMatches[0]?._id)
    ) {
      conflicts.push({
        employeeCode: expected.employeeCode,
        reason: "Duplicate or mismatched email/employeeCode identity"
      });
      continue;
    }

    const actual = codeMatches[0];

    const manager = expected.managerCode
      ? existingAccounts.find(
          account => account.employeeCode === expected.managerCode
        )
      : null;

    const problems = verifyExistingAccount(expected, actual, manager);

    if (problems.length > 0) {
      conflicts.push({
        employeeCode: expected.employeeCode,
        reason: problems.join("; ")
      });
      continue;
    }

    verified.push(expected.employeeCode);
    verifiedByCode.set(expected.employeeCode, actual);
  }

  return { missing, verified, conflicts, verifiedByCode };
}

async function createAccount(expected, manager) {
  const temporaryPassword = randomBytes(32).toString("base64url");
  const passwordHash = await bcrypt.hash(
    temporaryPassword,
    BCRYPT_ROUNDS
  );

  // The plaintext password is never persisted, printed, or returned.
  const account = await User.create({
    name: expected.name,
    email: expected.email,
    employeeCode: expected.employeeCode,
    password: passwordHash,
    role: expected.role,
    active: false,
    teamId: expected.teamId,
    managerId: manager?._id ?? null,
    employmentStartDate: EMPLOYMENT_START_DATE,
    employmentEndDate: null
  });

  return account;
}

async function main() {
  let connected = false;

  try {
    const connection = await setupIntegrationDatabase();
    connected = true;

    const identity = getVerifiedIntegrationIdentity(connection);

    if (User.db !== connection) {
      throw new Error("User model is not bound to the verified connection.");
    }

    console.log("\nGUARDED DATABASE VERIFIED");
    console.log(`Database: ${identity.databaseName}`);
    console.log(`Host: ${identity.host}:${identity.port}`);
    console.log(`Replica set: ${identity.replicaSetName}`);
    console.log(`Mode: ${APPLY ? "EXPLICIT APPLY" : "DRY RUN"}`);

    const existingAccounts = await loadExistingAccounts();
    const initial = inspectRoster(existingAccounts);

    console.log("\nINITIAL ROSTER CHECK");
    console.log(`Expected: ${ACCOUNT_ROSTER.length}`);
    console.log(`Already verified: ${initial.verified.length}`);
    console.log(`Missing: ${initial.missing.length}`);
    console.log(`Conflicts: ${initial.conflicts.length}`);

    if (initial.conflicts.length > 0) {
      console.log("\nCONFLICTS — OPERATION STOPPED");

      for (const conflict of initial.conflicts) {
        console.log(`- ${conflict.employeeCode}: ${conflict.reason}`);
      }

      process.exitCode = 1;
      return;
    }

    if (!APPLY) {
      console.log("\nDRY RUN COMPLETE.");
      console.log("No database modifications performed.");
      return;
    }

    const accountMap = new Map(initial.verifiedByCode);

    const creationOrder = [...ACCOUNT_ROSTER].sort((a, b) => {
      const priority = {
        project_manager: 0,
        team_lead: 1,
        team_member: 2
      };

      return priority[a.role] - priority[b.role];
    });

    let createdCount = 0;

    for (const expected of creationOrder) {
      if (accountMap.has(expected.employeeCode)) {
        continue;
      }

      const manager = expected.managerCode
        ? accountMap.get(expected.managerCode)
        : null;

      if (expected.managerCode && !manager) {
        throw new Error(
          `Required manager unavailable for ${expected.employeeCode}.`
        );
      }

      await createAccount(expected, manager);

      const created = await User.findOne({
        employeeCode: expected.employeeCode,
        email: expected.email
      }).select("+password");

      if (!created) {
        throw new Error(
          `Post-creation verification failed for ${expected.employeeCode}.`
        );
      }

      const problems = verifyExistingAccount(
        expected,
        created,
        manager
      );

      if (problems.length > 0) {
        throw new Error(
          `Post-creation verification failed for ${expected.employeeCode}.`
        );
      }

      accountMap.set(expected.employeeCode, created);
      createdCount += 1;

      console.log(`Created and verified: ${expected.employeeCode}`);
    }

    const finalAccounts = await loadExistingAccounts();
    const final = inspectRoster(finalAccounts);

    if (
      final.conflicts.length > 0 ||
      final.missing.length > 0 ||
      final.verified.length !== ACCOUNT_ROSTER.length
    ) {
      throw new Error("Final roster verification did not pass.");
    }

    console.log("\nPROVISIONING COMPLETE");
    console.log(`Created during this run: ${createdCount}`);
    console.log(`Verified total: ${final.verified.length}`);
    console.log("All nine synthetic accounts are inactive.");
    console.log("No assignments or PM access grants were created.");
  } catch {
    console.error(
      "\nPROVISIONING FAILED. Review the database state before retrying."
    );
    process.exitCode = 1;
  } finally {
    if (connected) {
      try {
        await teardownIntegrationDatabase();
        console.log("\nGuarded database connection closed.");
      } catch {
        console.error("WARNING: Database teardown failed.");
        process.exitCode = 1;
      }
    }
  }
}

main();

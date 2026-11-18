
import mongoose from "mongoose";

import User from "../models/User.js";
import SubmissionAccessGrant from "../models/SubmissionAccessGrant.js";
import { SubmissionApiError } from "./dailySubmissionService.js";

function assertValidObjectId(value, fieldName) {
  if (!mongoose.isValidObjectId(value)) {
    throw new SubmissionApiError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} must be a valid identifier.`
    );
  }
}

function assertNonEmptyString(value, fieldName, maxLength = 500) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    throw new SubmissionApiError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} is invalid.`
    );
  }
}

function assertGrantSource(grantSource) {
  if (
    !["SIMULATED_AUTHORIZATION", "VERIFIED_AUTHORIZATION"]
      .includes(grantSource)
  ) {
    throw new SubmissionApiError(
      400,
      "VALIDATION_ERROR",
      "The grant source is unsupported."
    );
  }
}

function unavailable() {
  return new SubmissionApiError(
    503,
    "DATABASE_UNAVAILABLE",
    "Read authorization is temporarily unavailable."
  );
}

function requireReadSession(session) {
  if (
    !session ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    session instanceof Date ||
    session.id == null ||
    session.hasEnded === true
  ) {
    throw unavailable();
  }

  return session;
}

/**
 * Verify persisted Project Manager organization authorization.
 * A caller-provided Boolean is never accepted as proof of access.
 */
export async function assertProjectManagerOrganizationAccess(
  projectManager,
  {
    SubmissionAccessGrantModel = SubmissionAccessGrant,
    session
  } = {}
) {
  // Verify actor and role.
  if (
    !projectManager ||
    projectManager.role !== "project_manager"
  ) {
    throw new SubmissionApiError(
      403,
      "FORBIDDEN",
      "You are not authorized to access organization submissions."
    );
  }

  // Only active Project Manager accounts are eligible.
  if (projectManager.active !== true) {
    throw new SubmissionApiError(
      403,
      "FORBIDDEN",
      "You are not authorized to access organization submissions."
    );
  }

  // Support both authenticated actor shapes.
  const userId = projectManager.id ?? projectManager._id;

  assertValidObjectId(userId, "Project Manager identifier");

  requireReadSession(session);

  const normalizedUserId = new mongoose.Types.ObjectId(userId);

  // Verify persisted active organization authorization in the caller's session.
  let grant;
  try {
    const grantQuery = SubmissionAccessGrantModel.findOne({
      userId: normalizedUserId,
      scope: "ORGANIZATION",
      active: true
    });

    if (
      !grantQuery ||
      typeof grantQuery.session !== "function"
    ) {
      throw unavailable();
    }

    const sessionQuery = grantQuery.session(session);
    if (!sessionQuery || typeof sessionQuery.lean !== "function") {
      throw unavailable();
    }

    grant = await sessionQuery.lean();
  } catch (error) {
    if (error instanceof SubmissionApiError) {
      throw error;
    }

    throw unavailable();
  }

  if (!grant) {
    throw new SubmissionApiError(
      403,
      "FORBIDDEN",
      "You are not authorized to access organization submissions."
    );
  }

  return true;
}

/**
 * Create a fresh organization grant.
 * Revoked grants are never reactivated.
 */
export async function createOrganizationAccessGrant({
  userId,
  grantReason,
  grantSource,
  provisioningRunId,
  grantedBy = null,
  models = {}
} = {}) {
  const UserModel = models.UserModel || User;

  const GrantModel =
    models.SubmissionAccessGrantModel || SubmissionAccessGrant;

  assertValidObjectId(userId, "User identifier");
  assertNonEmptyString(grantReason, "Grant reason");
  assertNonEmptyString(
    provisioningRunId,
    "Provisioning run identifier",
    100
  );
  assertGrantSource(grantSource);

  if (grantedBy !== null) {
    assertValidObjectId(grantedBy, "Grant author identifier");
  }

  const targetUser = await UserModel.findById(userId)
    .select("_id role")
    .lean();

  if (!targetUser || targetUser.role !== "project_manager") {
    throw new SubmissionApiError(
      403,
      "FORBIDDEN",
      "An eligible Project Manager account is required."
    );
  }

  const existingGrant = await GrantModel.findOne({
    userId: targetUser._id,
    scope: "ORGANIZATION",
    active: true
  }).lean();

  if (existingGrant) {
    throw new SubmissionApiError(
      409,
      "ACCESS_GRANT_ALREADY_ACTIVE",
      "An active organization grant already exists."
    );
  }

  try {
    const grant = await GrantModel.create({
      userId: targetUser._id,
      scope: "ORGANIZATION",
      active: true,
      grantedBy,
      grantReason: grantReason.trim(),
      grantSource,
      provisioningRunId: provisioningRunId.trim()
    });

    return {
      grantId: String(grant._id),
      userId: String(grant.userId),
      scope: grant.scope,
      active: grant.active
    };
  } catch (error) {
    if (error?.code === 11000) {
      throw new SubmissionApiError(
        409,
        "ACCESS_GRANT_ALREADY_ACTIVE",
        "An active organization grant already exists."
      );
    }

    throw error;
  }
}

/**
 * Revoke an active grant without deleting its history.
 */
export async function revokeOrganizationAccessGrant({
  grantId,
  revocationReason,
  revokedBy = null,
  models = {}
} = {}) {
  const GrantModel =
    models.SubmissionAccessGrantModel || SubmissionAccessGrant;

  assertValidObjectId(grantId, "Grant identifier");
  assertNonEmptyString(revocationReason, "Revocation reason");

  if (revokedBy !== null) {
    assertValidObjectId(revokedBy, "Revoking user identifier");
  }

  const result = await GrantModel.updateOne(
    {
      _id: new mongoose.Types.ObjectId(grantId),
      scope: "ORGANIZATION",
      active: true
    },
    {
      $set: {
        active: false,
        revokedBy,
        revokedAt: new Date(),
        revocationReason: revocationReason.trim()
      }
    },
    {
      runValidators: true
    }
  );

  if (result.modifiedCount !== 1) {
    throw new SubmissionApiError(
      409,
      "ACCESS_GRANT_NOT_ACTIVE",
      "The organization grant does not exist or is no longer active."
    );
  }

  return {
    grantId,
    active: false
  };
}

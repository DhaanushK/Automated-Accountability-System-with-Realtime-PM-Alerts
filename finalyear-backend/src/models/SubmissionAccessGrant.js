
import mongoose from "mongoose";

const submissionAccessGrantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },

  scope: {
    type: String,
    enum: ["ORGANIZATION"],
    required: true,
    immutable: true
  },

  active: {
    type: Boolean,
    default: true,
    required: true
  },

  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    immutable: true
  },

  grantedAt: {
    type: Date,
    default: Date.now,
    required: true,
    immutable: true
  },

  grantReason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
    immutable: true
  },

  grantSource: {
    type: String,
    enum: [
      "SIMULATED_AUTHORIZATION",
      "VERIFIED_AUTHORIZATION"
    ],
    required: true,
    immutable: true
  },

  provisioningRunId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    immutable: true
  },

  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  revokedAt: {
    type: Date,
    default: null
  },

  revocationReason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 500
  }

}, {
  timestamps: true,
  strict: "throw",
  collection: "submission_access_grants",
  autoCreate: false,
  autoIndex: false
});

// Enforce consistent grant and revocation states.
submissionAccessGrantSchema.pre("validate", function () {
  if (this.active === true) {
    if (
      this.revokedBy != null ||
      this.revokedAt != null ||
      this.revocationReason != null
    ) {
      this.invalidate(
        "active",
        "Active grants cannot contain revocation metadata."
      );
    }
  }

  if (this.active === false) {
    if (!(this.revokedAt instanceof Date) ||
        Number.isNaN(this.revokedAt.getTime())) {
      this.invalidate(
        "revokedAt",
        "Revoked grants require a valid revocation timestamp."
      );
    }

    if (
      typeof this.revocationReason !== "string" ||
      !this.revocationReason.trim()
    ) {
      this.invalidate(
        "revocationReason",
        "Revoked grants require a revocation reason."
      );
    }
  }
});

// Only one active grant per user and scope.
// Historical revoked grants remain preserved.
submissionAccessGrantSchema.index(
  { userId: 1, scope: 1 },
  {
    unique: true,
    name: "uniq_active_user_access_scope",
    partialFilterExpression: {
      active: true
    }
  }
);

// Supports historical access-grant lookups.
submissionAccessGrantSchema.index(
  { userId: 1, grantedAt: -1 },
  {
    name: "user_access_grant_history"
  }
);

export default mongoose.model(
  "SubmissionAccessGrant",
  submissionAccessGrantSchema
);

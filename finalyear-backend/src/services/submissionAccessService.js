import User from "../models/User.js";
import { SubmissionApiError } from "./dailySubmissionService.js";

export function getAuthenticatedUserId(authenticatedUser) {
  const userId = authenticatedUser?.id;
  if (typeof userId !== "string" || !/^[a-f\d]{24}$/i.test(userId)) {
    throw new SubmissionApiError(401, "UNAUTHENTICATED", "A valid authenticated user is required.");
  }
  return userId;
}

export async function loadSubmissionActor(
  userId,
  { UserModel = User } = {}
) {
  const user = await UserModel.findById(userId)
    .select("_id role active teamId managerId employmentStartDate employmentEndDate")
    .lean();

  if (!user) {
    throw new SubmissionApiError(401, "UNAUTHENTICATED", "The authenticated user is unavailable.");
  }

  return {
    id: String(user._id),
    role: user.role,
    active: user.active === true,
    teamId: user.teamId || null,
    managerId: user.managerId ? String(user.managerId) : null,
    employmentStartDate: user.employmentStartDate || null,
    employmentEndDate: user.employmentEndDate || null
  };
}


export function assertActiveTeamMember(actor) {
  if (actor?.role !== "team_member") {
    throw new SubmissionApiError(
      403,
      "FORBIDDEN",
      "A Team Member account is required to submit metrics."
    );
  }

  if (actor.active !== true) {
    throw new SubmissionApiError(
      403,
      "ACCOUNT_INACTIVE",
      "Your account is inactive and cannot submit new metrics."
    );
  }

  return actor;
}


export function assertTeamLeadScope(teamLead, employee) {
  const hasRequiredRoster =
    teamLead?.role === "team_lead" &&
    teamLead.active === true &&
    employee?.active === true &&
    teamLead.teamId &&
    employee.teamId &&
    employee.managerId === teamLead.id;

  if (!hasRequiredRoster || teamLead.teamId !== employee.teamId) {
    throw new SubmissionApiError(403, "FORBIDDEN", "The employee is outside the Team Lead's authorized scope.");
  }
  return true;
}

export function assertProjectManagerScope(projectManager, { organizationAuthorized = false } = {}) {
  if (
    projectManager?.role !== "project_manager" ||
    projectManager.active !== true ||
    organizationAuthorized !== true
  ) {
    throw new SubmissionApiError(403, "FORBIDDEN", "Project Manager organization access is not authorized.");
  }
  return true;
}
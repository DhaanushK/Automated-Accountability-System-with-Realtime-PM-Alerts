
import mongoose from "mongoose";
import User from "../models/User.js";
import EmployeeReportingAssignment from "../models/EmployeeReportingAssignment.js";

class InternalMailAccessError extends Error {
  constructor(message, statusCode = 403, code = "MAIL_ACCESS_DENIED") {
    super(message);
    this.name = "InternalMailAccessError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getIndiaDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

async function getActiveUser(userId, session = null) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new InternalMailAccessError(
      "Invalid user identifier.",
      400,
      "INVALID_USER_ID"
    );
  }

  let query = User.findOne({
  _id: userId,
  active: true
}).select("_id name email role active teamId");

if (session) {
  query = query.session(session);
}

const user = await query;

  if (!user) {
    throw new InternalMailAccessError(
      "The selected user is unavailable or inactive.",
      404,
      "USER_UNAVAILABLE"
    );
  }

  return user;
}

async function getCurrentAssignedTeamLead(teamMemberId, session = null) {
  const today = getIndiaDateString();

  let assignmentQuery = EmployeeReportingAssignment.find({
  employeeId: teamMemberId,
  effectiveStartDate: { $lte: today },
  $or: [
    { effectiveEndDate: null },
    { effectiveEndDate: { $gte: today } }
  ]
})
  .select("employeeId teamLeadId teamId effectiveStartDate effectiveEndDate");

if (session) {
  assignmentQuery = assignmentQuery.session(session);
}

const assignments = await assignmentQuery.lean();

  if (assignments.length === 0) {
    throw new InternalMailAccessError(
      "No current Team Lead assignment was found.",
      403,
      "CURRENT_ASSIGNMENT_NOT_FOUND"
    );
  }

  if (assignments.length !== 1) {
    throw new InternalMailAccessError(
      "Multiple current Team Lead assignments were found. Please contact the Project Manager.",
      409,
      "AMBIGUOUS_CURRENT_ASSIGNMENT"
    );
  }

  const assignment = assignments[0];

  if (
    !mongoose.Types.ObjectId.isValid(assignment.teamLeadId) ||
  typeof assignment.teamId !== "string" ||
  !assignment.teamId.trim()
  ) {
    throw new InternalMailAccessError(
      "The current reporting assignment is incomplete.",
      409,
      "INVALID_ASSIGNMENT"
    );
  }

  const teamMember = await getActiveUser(teamMemberId, session);
  const teamLead = await getActiveUser(assignment.teamLeadId, session);

// Ensure the Team Member still belongs to the assigned team.
if (
  teamMember.role !== "team_member" ||
  typeof teamMember.teamId !== "string" ||
  !teamMember.teamId.trim() ||
  teamMember.teamId !== assignment.teamId
) {
  throw new InternalMailAccessError(
    "The Team Member and reporting assignment have inconsistent team IDs.",
    409,
    "TEAM_MEMBER_TEAM_ID_MISMATCH"
  );
}

  if (teamLead.role !== "team_lead") {
    throw new InternalMailAccessError(
      "The assigned reporting user is not a Team Lead.",
      409,
      "INVALID_TEAM_LEAD"
    );
  }
  // Ensure the Team Lead still belongs to the assigned team.
  if (
    typeof teamLead.teamId !== "string" ||
    !teamLead.teamId.trim() ||
    teamLead.teamId !== assignment.teamId
  ) {
  throw new InternalMailAccessError(
    "The Team Lead and reporting assignment have inconsistent team IDs.",
    409,
    "TEAM_ID_MISMATCH"
  );
}

return teamLead;
}

export async function assertCanStartConversation(senderId, recipientId, session = null) {
  if (!mongoose.Types.ObjectId.isValid(senderId)) {
    throw new InternalMailAccessError(
      "Invalid sender identifier.",
      401,
      "INVALID_SENDER"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(recipientId)) {
    throw new InternalMailAccessError(
      "Invalid recipient identifier.",
      400,
      "INVALID_RECIPIENT"
    );
  }

  const sender = await getActiveUser(senderId, session);
  const recipient = await getActiveUser(recipientId, session);

  if (String(sender._id) === String(recipient._id)) {
    if (!["project_manager", "team_lead", "team_member"].includes(sender.role)) {
      throw new InternalMailAccessError(
        "Your account role is not permitted to use the internal mailbox.",
        403,
        "UNSUPPORTED_SENDER_ROLE"
      );
    }

    return { sender, recipient, teamMemberId: null, isSelfConversation: true };
  }

  switch (sender.role) {
    case "project_manager": {
      if (!["team_lead", "team_member"].includes(recipient.role)) {
        throw new InternalMailAccessError(
          "Project Managers can message Team Leads and Team Members.",
          403,
          "RECIPIENT_ROLE_NOT_ALLOWED"
        );
      }
      break;
    }

    case "team_lead": {
      if (recipient.role === "project_manager") {
        break;
      }

      if (recipient.role !== "team_member") {
        throw new InternalMailAccessError(
          "Team Leads can message only the Project Manager or their assigned Team Members.",
          403,
          "RECIPIENT_ROLE_NOT_ALLOWED"
        );
      }

      const assignedTeamLead = await getCurrentAssignedTeamLead(recipient._id, session);

      if (!assignedTeamLead._id.equals(sender._id)) {
        throw new InternalMailAccessError(
          "You can message only Team Members currently assigned to you.",
          403,
          "TEAM_MEMBER_NOT_ASSIGNED"
        );
      }
      break;
    }

    case "team_member": {
      if (recipient.role !== "team_lead") {
        throw new InternalMailAccessError(
          "Team Members can message only their assigned Team Lead.",
          403,
          "RECIPIENT_ROLE_NOT_ALLOWED"
        );
      }

      const assignedTeamLead = await getCurrentAssignedTeamLead(sender._id, session);

      if (!assignedTeamLead._id.equals(recipient._id)) {
        throw new InternalMailAccessError(
          "You can message only your currently assigned Team Lead.",
          403,
          "TEAM_LEAD_NOT_ASSIGNED"
        );
      }
      break;
    }

    default:
      throw new InternalMailAccessError(
        "Your account role is not permitted to use the internal mailbox.",
        403,
        "UNSUPPORTED_SENDER_ROLE"
      );
  }

  const teamMemberId =
  sender.role === "team_member"
    ? sender._id
    : recipient.role === "team_member"
      ? recipient._id
      : null;

  return { sender, recipient, teamMemberId, isSelfConversation: false };
}

export { InternalMailAccessError };

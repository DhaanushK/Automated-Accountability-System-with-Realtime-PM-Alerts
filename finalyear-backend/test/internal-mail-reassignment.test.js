
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../src/models/User.js";
import EmployeeReportingAssignment from "../src/models/EmployeeReportingAssignment.js";
import InternalConversation from "../src/models/InternalConversation.js";
import InternalMessage from "../src/models/InternalMessage.js";

import {
  sendConversationReply
} from "../src/services/internalConversationService.js";

function createQuery(value, calls = {}) {
  return {
    select(fields) {
      calls.selectedFields = fields;
      return this;
    },
    session(session) {
      calls.session = session;
      return this;
    },
    lean() {
      calls.leanCalled = true;
      return Promise.resolve(value);
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    }
  };
}

function createUser(role, id = new mongoose.Types.ObjectId()) {
  return {
    _id: id,
    name: role,
    email: `${role}@example.test`,
    role,
    active: true,
    teamId: "team-alpha"
  };
}

function createScenario(senderRole, recipientRole) {
  const sender = createUser(senderRole);
  const recipient = createUser(recipientRole);
  const newTeamLead = createUser("team_lead");

  let currentTeamLeadId = newTeamLead._id;

  if (senderRole === "team_member" && recipientRole === "team_lead") {
    currentTeamLeadId = recipient._id;
  }

  if (senderRole === "team_lead" && recipientRole === "team_member") {
    currentTeamLeadId = sender._id;
  }

  const users = new Map([
    [String(sender._id), sender],
    [String(recipient._id), recipient],
    [String(newTeamLead._id), newTeamLead]
  ]);

  return {
    sender,
    recipient,
    newTeamLead,
    users,
    assignment: {
      employeeId:
        senderRole === "team_member" ? sender._id : recipient._id,
      teamLeadId: currentTeamLeadId,
      teamId: "team-alpha",
      effectiveStartDate: "2026-01-01",
      effectiveEndDate: null
    }
  };
}

async function withReplyMocks(scenario, run) {
  const originalMethods = {
    userFindOne: User.findOne,
    assignmentFind: EmployeeReportingAssignment.find,
    conversationFindById: InternalConversation.findById,
    messageCreate: InternalMessage.create,
    startSession: mongoose.startSession
  };

  const session = {
    ended: false,
    transactionOptions: null,

    async withTransaction(callback, options) {
      this.transactionOptions = options;
      return callback();
    },

    async endSession() {
      this.ended = true;
    }
  };

  const calls = {
    userQuerySessions: [],
    assignmentQuerySessions: [],
    assignmentFilters: [],
    messageCreates: 0,
    messageCreateSessions: [],
    conversationSaves: 0,
    conversationSaveSessions: []
  };

  const conversation = {
    _id: new mongoose.Types.ObjectId(),
    participants: [
      scenario.sender._id,
      scenario.recipient._id
    ],
    lastMessageAt: new Date("2026-01-01T00:00:00.000Z"),
    lastMessagePreview: "Original message",
    lastMessageId: new mongoose.Types.ObjectId(),

    async save(options) {
      calls.conversationSaves += 1;
      calls.conversationSaveSessions.push(options.session);
    }
  };

  User.findOne = filter => {
    const user = scenario.users.get(String(filter._id));
    const queryCalls = {};

    const query = createQuery(user, queryCalls);
    const originalSession = query.session;

    query.session = function (value) {
      originalSession.call(this, value);
      calls.userQuerySessions.push(value);
      return this;
    };

    return query;
  };

  EmployeeReportingAssignment.find = filter => {
    calls.assignmentFilters.push(filter);

    const query = createQuery(
      [scenario.assignment],
      {}
    );

    const originalSession = query.session;

    query.session = function (value) {
      originalSession.call(this, value);
      calls.assignmentQuerySessions.push(value);
      return this;
    };

    return query;
  };

  InternalConversation.findById = () =>
    createQuery(conversation);

  InternalMessage.create = async (documents, options) => {
    calls.messageCreates += 1;
    calls.messageCreateSessions.push(options.session);

    const document = documents[0];

    return [{
      _id: new mongoose.Types.ObjectId(),
      conversationId: document.conversationId,
      senderId: document.senderId,
      recipientId: document.recipientId,
      content: document.content,
      createdAt: new Date("2026-11-22T10:00:00.000Z"),
      readAt: document.readAt
    }];
  };

  mongoose.startSession = async () => session;

  try {
    return await run({
      session,
      calls,
      conversation,
      scenario
    });
  } finally {
    User.findOne = originalMethods.userFindOne;
    EmployeeReportingAssignment.find = originalMethods.assignmentFind;
    InternalConversation.findById = originalMethods.conversationFindById;
    InternalMessage.create = originalMethods.messageCreate;
    mongoose.startSession = originalMethods.startSession;
  }
}

async function expectAllowedReply(scenario) {
  await withReplyMocks(scenario, async ({
    session,
    calls,
    conversation
  }) => {
    const result = await sendConversationReply({
      senderId: scenario.sender._id,
      conversationId: conversation._id,
      content: "A valid reply"
    });

    assert.equal(result.success, true);
    assert.equal(result.data.senderId, String(scenario.sender._id));
    assert.equal(result.data.recipientId, String(scenario.recipient._id));

    assert.equal(calls.messageCreates, 1);
    assert.equal(calls.conversationSaves, 1);

    const requiresAssignmentCheck =
  (scenario.sender.role === "team_member" &&
    scenario.recipient.role === "team_lead") ||
  (scenario.sender.role === "team_lead" &&
    scenario.recipient.role === "team_member");

assert.equal(
  calls.assignmentFilters.length,
  requiresAssignmentCheck ? 1 : 0,
  "Assignment lookup must occur only for TM-TL conversations"
);

if (requiresAssignmentCheck) {
  assert.deepEqual(calls.assignmentQuerySessions, [session]);
}

    assert.deepEqual(calls.messageCreateSessions, [session]);
    assert.deepEqual(calls.conversationSaveSessions, [session]);

    assert.ok(
      calls.userQuerySessions.every(value => value === session),
      "Every user authorization query must use the transaction session"
    );

    assert.equal(session.ended, true);
  });
}

async function expectBlockedReply(scenario, expectedCode) {
  await withReplyMocks(scenario, async ({
    session,
    calls,
    conversation
  }) => {
    const originalMetadata = {
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageId: conversation.lastMessageId
    };

    await assert.rejects(
      sendConversationReply({
        senderId: scenario.sender._id,
        conversationId: conversation._id,
        content: "This reply must be rejected"
      }),
      error => {
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, expectedCode);
        return true;
      }
    );

    assert.equal(calls.messageCreates, 0);
    assert.equal(calls.conversationSaves, 0);

    assert.equal(
      conversation.lastMessageAt,
      originalMetadata.lastMessageAt
    );
    assert.equal(
      conversation.lastMessagePreview,
      originalMetadata.lastMessagePreview
    );
    assert.equal(
      conversation.lastMessageId,
      originalMetadata.lastMessageId
    );

    assert.ok(
      calls.userQuerySessions.every(value => value === session),
      "Every user authorization query must use the transaction session"
    );

    assert.ok(
      calls.assignmentQuerySessions.every(value => value === session),
      "Assignment lookup must use the transaction session"
    );

    assert.equal(
  calls.assignmentFilters.length,
  1,
  "A current assignment lookup must occur before rejecting the reply"
);
    assert.equal(session.ended, true);
  });
}

test("currently assigned Team Member can reply to their Team Lead", async () => {
  const scenario = createScenario("team_member", "team_lead");

  await expectAllowedReply(scenario);
});

test("currently assigned Team Lead can reply to their Team Member", async () => {
  const scenario = createScenario("team_lead", "team_member");

  await expectAllowedReply(scenario);
});

test("Team Member cannot reply to their previous Team Lead after reassignment", async () => {
  const scenario = createScenario("team_member", "team_lead");

  scenario.assignment.teamLeadId = scenario.newTeamLead._id;

  await expectBlockedReply(
    scenario,
    "TEAM_LEAD_NOT_ASSIGNED"
  );
});

test("previous Team Lead cannot reply to a reassigned Team Member", async () => {
  const scenario = createScenario("team_lead", "team_member");

  scenario.assignment.teamLeadId = scenario.newTeamLead._id;

  await expectBlockedReply(
    scenario,
    "TEAM_MEMBER_NOT_ASSIGNED"
  );
});

test("Project Manager can reply to a Team Member after Team Lead reassignment", async () => {
  const scenario = createScenario("project_manager", "team_member");

  scenario.assignment.teamLeadId = scenario.newTeamLead._id;

  await expectAllowedReply(scenario);
});

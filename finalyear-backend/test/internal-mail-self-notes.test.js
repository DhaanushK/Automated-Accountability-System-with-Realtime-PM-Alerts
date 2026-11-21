import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import InternalConversation from "../src/models/InternalConversation.js";
import InternalMessage from "../src/models/InternalMessage.js";
import { assertCanStartConversation } from "../src/services/internalMailAccessService.js";
import {
  createPrivateConversation,
  sendConversationReply
} from "../src/services/internalConversationService.js";

function makeQuery(value, calls, label) {
  return {
    select() { return this; },
    session(session) { calls.sessions.push({ label, session }); return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

async function withSelfNoteMocks(callback) {
  const userId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();
  const user = {
    _id: userId,
    name: "Synthetic Team Member",
    email: "note-owner@example.invalid",
    role: "team_member",
    active: true,
    teamId: "TEAM-TEST"
  };
  const calls = {
    userFindOne: [],
    userUpdates: [],
    sessions: [],
    createdConversations: [],
    createdMessages: [],
    transactionOptions: [],
    endedSessions: 0
  };
  let conversation;
  const descriptors = [
    [User, "findOne"], [User, "updateOne"],
    [InternalConversation, "create"], [InternalConversation, "findById"],
    [InternalMessage, "create"], [mongoose, "startSession"]
  ].map(([target, key]) => [target, key, Object.getOwnPropertyDescriptor(target, key)]);

  try {
    User.findOne = filter => {
      calls.userFindOne.push(filter);
      return makeQuery(user, calls, "User.findOne");
    };
    User.updateOne = (...args) => {
      calls.userUpdates.push(args);
      return Promise.resolve({ matchedCount: 1 });
    };
    InternalConversation.create = async ([document]) => {
      calls.createdConversations.push(document);
      conversation = {
        ...document,
        _id: conversationId,
        save: async function () { return this; }
      };
      return [conversation];
    };
    InternalConversation.findById = id => {
      assert.equal(String(id), String(conversationId));
      return makeQuery(conversation, calls, "InternalConversation.findById");
    };
    InternalMessage.create = async ([document]) => {
      const message = {
        ...document,
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date("2026-11-22T10:00:00.000Z")
      };
      calls.createdMessages.push(message);
      return [message];
    };
    mongoose.startSession = async () => ({
      withTransaction: async (callback, options) => {
        calls.transactionOptions.push(options);
        await callback();
      },
      endSession: async () => { calls.endedSessions += 1; }
    });

    await callback({ userId, conversationId, user, calls });
  } finally {
    for (const [target, key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete target[key];
    }
  }
}

test("supported active users can authorize a self-note without assignment lookup", async () => {
  await withSelfNoteMocks(async ({ userId, calls }) => {
    const session = { id: "self-note-access-session" };
    const result = await assertCanStartConversation(userId, userId, session);

    assert.equal(String(result.sender._id), String(userId));
    assert.equal(String(result.recipient._id), String(userId));
    assert.equal(result.isSelfConversation, true);
    assert.equal(result.teamMemberId, null);
    assert.deepEqual(calls.sessions, [
      { label: "User.findOne", session },
      { label: "User.findOne", session }
    ]);
  });
});

test("self-note conversation and message schemas accept one owner and self-recipient", async () => {
  const userId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();
  const conversation = new InternalConversation({
    _id: conversationId,
    subject: "Personal note",
    participants: [userId],
    createdBy: userId
  });
  await conversation.validate();

  const message = new InternalMessage({
    conversationId,
    senderId: userId,
    recipientId: userId,
    content: "Remember to submit the report"
  });
  await message.validate();

  const duplicateParticipants = new InternalConversation({
    subject: "Invalid duplicate participants",
    participants: [userId, userId],
    createdBy: userId
  });
  await assert.rejects(duplicateParticipants.validate());
});

test("self-note creation and replies stay private, session-bound, and read", async () => {
  await withSelfNoteMocks(async ({ userId, conversationId, calls }) => {
    const created = await createPrivateConversation({
      senderId: userId,
      recipientId: userId,
      subject: "Personal note",
      content: "Remember to submit the report"
    });

    assert.equal(created.success, true);
    assert.deepEqual(calls.createdConversations[0].participants.map(String), [String(userId)]);
    assert.equal(String(calls.createdMessages[0].senderId), String(userId));
    assert.equal(String(calls.createdMessages[0].recipientId), String(userId));
    assert.ok(calls.createdMessages[0].readAt instanceof Date);
    assert.equal(calls.userUpdates.length, 0);

    const reply = await sendConversationReply({
      senderId: userId,
      conversationId,
      content: "Add the updated totals too"
    });

    assert.equal(reply.success, true);
    assert.equal(String(calls.createdMessages[1].senderId), String(userId));
    assert.equal(String(calls.createdMessages[1].recipientId), String(userId));
    assert.ok(calls.createdMessages[1].readAt instanceof Date);
    assert.equal(calls.endedSessions, 2);
    assert.equal(calls.transactionOptions.length, 2);
    assert.ok(calls.sessions.every(call => call.session && typeof call.session === "object"));
  });
});

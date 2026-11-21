
import mongoose from "mongoose";

import User from "../models/User.js";
import InternalConversation from "../models/InternalConversation.js";
import InternalMessage from "../models/InternalMessage.js";

import {
  assertCanStartConversation,
} from "./internalMailAccessService.js";

class InternalConversationError extends Error {
  constructor(message, statusCode = 400, code = "CONVERSATION_ERROR") {
    super(message);
    this.name = "InternalConversationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function validateObjectId(value, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new InternalConversationError(
      `Invalid ${fieldName}.`,
      400,
      "INVALID_IDENTIFIER"
    );
  }
}

function validateMessageContent(content) {
  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.trim().length > 10000
  ) {
    throw new InternalConversationError(
      "Message content must contain between 1 and 10,000 characters.",
      400,
      "INVALID_MESSAGE_CONTENT"
    );
  }

  return content.trim();
}

function validateSubject(subject) {
  if (
    typeof subject !== "string" ||
    !subject.trim() ||
    subject.trim().length > 200
  ) {
    throw new InternalConversationError(
      "Subject must contain between 1 and 200 characters.",
      400,
      "INVALID_SUBJECT"
    );
  }

  return subject.trim();
}

function createPreview(content) {
  return content.length > 240
    ? `${content.slice(0, 237)}...`
    : content;
}

export async function createPrivateConversation({
  senderId,
  recipientId,
  subject,
  content
}) {
  validateObjectId(senderId, "sender ID");
  validateObjectId(recipientId, "recipient ID");

  const validatedSubject = validateSubject(subject);
  const validatedContent = validateMessageContent(content);
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
        // Verify current mailbox permissions inside the transaction.
        const { sender, recipient, teamMemberId, isSelfConversation } =
  await assertCanStartConversation(
    senderId,
    recipientId,
    session
  );

// Coordinate conversation creation with reporting-assignment changes.
if (teamMemberId) {
  const coordinationUpdate = await User.updateOne(
    {
      _id: teamMemberId,
      role: "team_member",
      active: true
    },
    {
      $inc: { assignmentCoordinationVersion: 1 }
    },
    { session }
  );

  if (coordinationUpdate.matchedCount !== 1) {
    throw new InternalConversationError(
      "The Team Member account changed during conversation creation.",
      409,
      "EMPLOYEE_STATE_CHANGED"
    );
  }
}
      // Create one shared conversation for the two participants.
      const [conversation] = await InternalConversation.create(
        [{
          subject: validatedSubject,
          participants: isSelfConversation
            ? [sender._id]
            : [sender._id, recipient._id],
          createdBy: sender._id,
          lastMessagePreview: createPreview(validatedContent)
        }],
        { session }
      );

      // Create the first message.
      const [message] = await InternalMessage.create(
        [{
          conversationId: conversation._id,
          senderId: sender._id,
          recipientId: recipient._id,
          content: validatedContent,
          readAt: isSelfConversation ? new Date() : null
        }],
        { session }
      );

      // Link the first message to the conversation.
      conversation.lastMessageId = message._id;
      conversation.lastMessageAt = message.createdAt;

      await conversation.save({ session });

      result = {
        conversationId: conversation._id.toString(),
        messageId: message._id.toString(),
        subject: conversation.subject,
        senderId: sender._id.toString(),
        recipientId: recipient._id.toString(),
        content: message.content,
        createdAt: message.createdAt
      };
    }, {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" }
    });

    return {
      success: true,
      message: "Private conversation created successfully.",
      data: result
    };
  } finally {
    await session.endSession();
  }
}

export async function sendConversationReply({
  senderId,
  conversationId,
  content
}) {
  validateObjectId(senderId, "sender ID");
  validateObjectId(conversationId, "conversation ID");

  const validatedContent = validateMessageContent(content);

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      // Confirm that the sender has an active account.
      const sender = await User.findOne({
        _id: senderId,
        active: true
      })
        .select("_id role active")
        .session(session);

      if (!sender) {
        throw new InternalConversationError(
          "Sender account is unavailable or inactive.",
          403,
          "SENDER_INACTIVE"
        );
      }

      // Find the conversation and verify original participation.
      const conversation = await InternalConversation.findById(
        conversationId
      ).session(session);

      if (!conversation) {
        throw new InternalConversationError(
          "Conversation not found.",
          404,
          "CONVERSATION_NOT_FOUND"
        );
      }
            // Normal conversations have two distinct participants. A self-note
      // has one participant, who remains both sender and recipient.
      const participantIds = conversation.participants.map(
        participantId => participantId.toString()
      );
      const isSelfConversation =
        participantIds.length === 1 &&
        participantIds[0] === sender._id.toString();
      const isTwoPartyConversation =
        participantIds.length === 2 &&
        new Set(participantIds).size === 2;

      if (!isSelfConversation && !isTwoPartyConversation) {
        throw new InternalConversationError(
          "Conversation participants are invalid.",
          400,
          "INVALID_CONVERSATION_PARTICIPANTS"
        );
      }

      const isParticipant = conversation.participants.some(
        participantId => participantId.toString() === sender._id.toString()
      );

      if (!isParticipant) {
        throw new InternalConversationError(
          "You are not a participant in this conversation.",
          403,
          "NOT_A_CONVERSATION_PARTICIPANT"
        );
      }

      // Route a self-note reply back to its owner; otherwise use the other
      // original participant as the recipient.
      const recipientId = isSelfConversation
        ? sender._id
        : conversation.participants.find(
            participantId => participantId.toString() !== sender._id.toString()
          );

      // A recipient must have an active account to receive a reply.
      const recipient = await User.findOne({
        _id: recipientId,
        active: true
      })
        .select("_id active")
        .session(session);

      if (!recipient) {
        throw new InternalConversationError(
          "Recipient account is unavailable or inactive.",
          403,
          "RECIPIENT_INACTIVE"
        );
      }

      // Store the reply.
      const [message] = await InternalMessage.create(
        [{
          conversationId: conversation._id,
          senderId: sender._id,
          recipientId: recipient._id,
          content: validatedContent,
          readAt: isSelfConversation ? new Date() : null
        }],
        { session }
      );

      // Refresh conversation metadata.
      conversation.lastMessageAt = message.createdAt;
      conversation.lastMessagePreview = createPreview(validatedContent);
      conversation.lastMessageId = message._id;

      await conversation.save({ session });

      result = {
        conversationId: conversation._id.toString(),
        messageId: message._id.toString(),
        senderId: sender._id.toString(),
        recipientId: recipient._id.toString(),
        content: message.content,
        createdAt: message.createdAt
      };
    }, {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" }
    });

    return {
      success: true,
      message: "Reply sent successfully.",
      data: result
    };
  } finally {
    await session.endSession();
  }
}

export async function getConversationHistory({
  userId,
  conversationId,
  before,
  limit = 50
}) {
  validateObjectId(userId, "user ID");
  validateObjectId(conversationId, "conversation ID");
    // Verify that the requesting user has an active account.
  const activeUser = await User.findOne({
    _id: userId,
    active: true
  }).select("_id active");

  if (!activeUser) {
    throw new InternalConversationError(
      "User account is unavailable or inactive.",
      403,
      "USER_INACTIVE"
    );
  }

  // Validate pagination limit.
  const pageSize = Number(limit);

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50
  ) {
    throw new InternalConversationError(
      "Message limit must be between 1 and 50.",
      400,
      "INVALID_MESSAGE_LIMIT"
    );
  }

  // Validate pagination cursor when supplied.
  let cursor = null;
  if (before !== undefined && before !== null) {
    if (
      typeof before !== "object" ||
      Array.isArray(before) ||
      before === null ||
      typeof before.createdAt !== "string" ||
      typeof before.id !== "string" ||
      !mongoose.Types.ObjectId.isValid(before.id)
    ) {
      throw new InternalConversationError(
        "Invalid pagination cursor.",
        400,
        "INVALID_PAGINATION_CURSOR"
      );
    }

    const parsedCursorDate = new Date(before.createdAt);

    if (Number.isNaN(parsedCursorDate.getTime())) {
      throw new InternalConversationError(
        "Invalid pagination cursor.",
        400,
        "INVALID_PAGINATION_CURSOR"
      );
    }

    cursor = {
      createdAt: parsedCursorDate,
      id: new mongoose.Types.ObjectId(before.id)
    };
  }

  // Confirm conversation membership.
  const conversation = await InternalConversation.findOne({
    _id: conversationId,
    participants: userId
  }).select("_id subject participants createdAt");

  if (!conversation) {
    throw new InternalConversationError(
      "Conversation not found or access denied.",
      404,
      "CONVERSATION_NOT_FOUND"
    );
  }

  const messageFilter = {
    conversationId: conversation._id
  };

  if (cursor) {
    messageFilter.$or = [
      {
        createdAt: { $lt: cursor.createdAt }
      },
      {
        createdAt: cursor.createdAt,
        _id: { $lt: cursor.id }
      }
    ];
  }


  // Fetch newest messages first.
  const messages = await InternalMessage.find(messageFilter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageSize + 1)
    .select(
      "_id conversationId senderId recipientId content readAt createdAt"
    )
    .lean();

  // Determine whether older messages remain.
  const hasMore = messages.length > pageSize;

  if (hasMore) {
    messages.pop();
  }

  // Return the selected page in chronological order.
  messages.reverse();


  const oldestMessage = messages[0];

  const nextCursor = hasMore && oldestMessage
    ? {
        createdAt: oldestMessage.createdAt.toISOString(),
        id: oldestMessage._id.toString()
      }
    : null;


  return {
    success: true,
    data: {
      conversation: {
        id: conversation._id.toString(),
        subject: conversation.subject,
        participants: conversation.participants.map(
          participantId => participantId.toString()
        ),
        createdAt: conversation.createdAt
      },
      messages: messages.map(message => ({
        id: message._id.toString(),
        senderId: message.senderId.toString(),
        recipientId: message.recipientId.toString(),
        content: message.content,
        readAt: message.readAt,
        createdAt: message.createdAt
      })),
      pagination: {
        limit: pageSize,
        hasMore,
        nextCursor
      }
    }
  };
}

export async function getMailboxConversations({
  userId,
  folder = "inbox",
  limit = 50
}) {
  validateObjectId(userId, "user ID");

  if (typeof folder !== "string") {
    throw new InternalConversationError(
        "Folder must be either inbox or sent.",
        400,
     "INVALID_MAILBOX_FOLDER"
    );
  }

  const normalizedFolder = folder.toLowerCase();

  if (!["inbox", "sent"].includes(normalizedFolder)) {
    throw new InternalConversationError(
      "Folder must be either inbox or sent.",
      400,
      "INVALID_MAILBOX_FOLDER"
    );
  }

  const pageSize = Number(limit);

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50
  ) {
    throw new InternalConversationError(
      "Conversation limit must be between 1 and 50.",
      400,
      "INVALID_CONVERSATION_LIMIT"
    );
  }

  // Verify that the mailbox owner has an active account.
  const user = await User.findOne({
    _id: userId,
    active: true
  }).select("_id active");

  if (!user) {
    throw new InternalConversationError(
      "User account is unavailable or inactive.",
      403,
      "USER_INACTIVE"
    );
  }

  // Identify conversations based on message direction.
  const messageFilter = normalizedFolder === "inbox"
    ? { recipientId: user._id }
    : { senderId: user._id };

  const conversationIds = await InternalMessage.distinct(
    "conversationId",
    messageFilter
  );

  // Retrieve only conversations belonging to this user.
  const conversations = await InternalConversation.find({
    _id: { $in: conversationIds },
    participants: user._id
  })
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(pageSize)
    .populate({
      path: "participants",
      select: "name email role active"
    })
    .lean();

  // Calculate unread messages for the Inbox.
  let unreadCounts = new Map();
  let totalUnreadCount = 0;

  if (normalizedFolder === "inbox") {
    const unreadResults = await InternalMessage.aggregate([
      {
        $match: {
          conversationId: { $in: conversations.map(c => c._id) },
          recipientId: user._id,
          readAt: null
        }
      },
      {
        $group: {
          _id: "$conversationId",
          count: { $sum: 1 }
        }
      }
    ]);

    unreadCounts = new Map(
      unreadResults.map(item => [
        item._id.toString(),
        item.count
      ])
    );

    totalUnreadCount = await InternalMessage.countDocuments({
      recipientId: user._id,
      readAt: null
    });
  }

  const mailboxItems = conversations.map(conversation => {
    const otherParticipant = conversation.participants.find(
      participant =>
        participant._id.toString() !== user._id.toString()
    );

    return {
      conversationId: conversation._id.toString(),
      subject: conversation.subject,
      otherParticipant: otherParticipant
        ? {
            id: otherParticipant._id.toString(),
            name: otherParticipant.name,
            email: otherParticipant.email,
            role: otherParticipant.role
          }
        : null,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageId: conversation.lastMessageId
        ? conversation.lastMessageId.toString()
        : null,
      unreadCount: normalizedFolder === "inbox"
        ? unreadCounts.get(conversation._id.toString()) || 0
        : 0
    };
  });

  return {
    success: true,
    data: {
      folder: normalizedFolder,
      conversations: mailboxItems,
      unreadCount: normalizedFolder === "inbox"
        ? totalUnreadCount
        : 0,
      limit: pageSize
    }
  };
}

export async function markMessageAsRead({
  userId,
  messageId
}) {
  validateObjectId(userId, "user ID");
  validateObjectId(messageId, "message ID");

  const user = await User.findOne({
    _id: userId,
    active: true
  }).select("_id");

  if (!user) {
    throw new InternalConversationError(
      "User account is unavailable or inactive.",
      403,
      "USER_INACTIVE"
    );
  }

  const message = await InternalMessage.findOne({
    _id: messageId,
    recipientId: user._id
  });

  if (!message) {
    throw new InternalConversationError(
      "Message not found or access denied.",
      404,
      "MESSAGE_NOT_FOUND"
    );
  }

  // Confirm that the user belongs to the conversation.
  const conversation = await InternalConversation.exists({
    _id: message.conversationId,
    participants: user._id
  });

  if (!conversation) {
    throw new InternalConversationError(
      "Conversation access denied.",
      403,
      "NOT_A_CONVERSATION_PARTICIPANT"
    );
  }

  // Preserve the original timestamp if already read.
  const updatedMessage = await InternalMessage.findOneAndUpdate(
    {
      _id: message._id,
      recipientId: user._id,
      readAt: null
    },
    {
      $set: {
        readAt: new Date()
      }
    },
    {
      new: true,
      runValidators: true
    }
  ).select("_id conversationId readAt");
  const finalMessage = updatedMessage || await InternalMessage.findOne({
    _id: message._id,
    recipientId: user._id
  }).select("_id conversationId readAt");

  if (!finalMessage) {
    throw new InternalConversationError(
      "Message is no longer available.",
      404,
      "MESSAGE_NOT_FOUND"
    );
  }

  return {
    success: true,
    message: "Message read status processed successfully.",
    data: {
      messageId: finalMessage._id.toString(),
      conversationId: finalMessage.conversationId.toString(),
      readAt: finalMessage.readAt,
      alreadyRead: Boolean(finalMessage.readAt) && !updatedMessage
    }
  };
}

export async function getUnreadMessageCount({ userId }) {
  validateObjectId(userId, "user ID");

  const user = await User.findOne({
    _id: userId,
    active: true
  }).select("_id");

  if (!user) {
    throw new InternalConversationError(
      "User account is unavailable or inactive.",
      403,
      "USER_INACTIVE"
    );
  }

  const unreadCount = await InternalMessage.countDocuments({
    recipientId: user._id,
    readAt: null
  });

  return {
    success: true,
    data: {
      unreadCount
    }
  };
}

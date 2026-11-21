
import mongoose from "mongoose";

const { Schema } = mongoose;

const internalMessageSchema = new Schema({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: "InternalConversation",
    required: true,
    immutable: true
  },

  senderId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },

  recipientId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },

  content: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 10000,
    validate: {
      validator: value =>
        typeof value === "string" && value.trim().length > 0,
      message: "Message content cannot be empty."
    }
  },

  // Null means the recipient has not read this message.
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  strict: "throw",
  collection: "internal_messages"
});

// Supports retrieving messages in conversation order.
internalMessageSchema.index(
  { conversationId: 1, createdAt: 1 },
  { name: "conversation_message_history" }
);

// Supports unread-message queries for each recipient.
internalMessageSchema.index(
  { recipientId: 1, readAt: 1, createdAt: -1 },
  { name: "recipient_unread_messages" }
);

// Supports retrieving messages sent by a user.
internalMessageSchema.index(
  { senderId: 1, createdAt: -1 },
  { name: "sender_message_history" }
);

const InternalMessage =
  mongoose.models.InternalMessage ||
  mongoose.model("InternalMessage", internalMessageSchema);

export default InternalMessage;

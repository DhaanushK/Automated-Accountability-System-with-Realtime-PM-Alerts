
import mongoose from "mongoose";

const { Schema } = mongoose;

const internalConversationSchema = new Schema({
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  participants: [{
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  }],

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true
  },

  lastMessageAt: {
    type: Date,
    default: null
  },

  lastMessagePreview: {
    type: String,
    default: "",
    maxlength: 240
  },

  lastMessageId: {
    type: Schema.Types.ObjectId,
    ref: "InternalMessage",
    default: null
  }
}, {
  timestamps: true,
  strict: "throw",
  collection: "internal_conversations"
});

// A conversation has either one owner (a private self-note) or two
// distinct participants. The creator must always be a participant.
internalConversationSchema.pre("validate", function () {
  if (
    !Array.isArray(this.participants) ||
    ![1, 2].includes(this.participants.length)
  ) {
    this.invalidate(
      "participants",
      "A conversation must have one owner or two participants."
    );
    return;
  }

  const participantIds = this.participants.map(id => String(id));

  if (new Set(participantIds).size !== participantIds.length) {
    this.invalidate(
      "participants",
      "Conversation participants must be unique."
    );
  }

  if (
    this.createdBy &&
    !participantIds.includes(String(this.createdBy))
  ) {
    this.invalidate(
      "createdBy",
      "The conversation creator must be a participant."
    );
  }
});

// Supports retrieving a user's conversations by recent activity.
internalConversationSchema.index(
  { participants: 1, lastMessageAt: -1 },
  { name: "participant_recent_conversations" }
);

const InternalConversation =
  mongoose.models.InternalConversation ||
  mongoose.model("InternalConversation", internalConversationSchema);

export default InternalConversation;

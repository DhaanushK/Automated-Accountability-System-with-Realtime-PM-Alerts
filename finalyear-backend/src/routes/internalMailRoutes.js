import express from "express";

import {
  createConversation,
  sendReply,
  getConversationHistoryController,
  getMailbox,
  markAsRead,
  getUnreadCount
} from "../controllers/internalMailController.js";

import { authMiddleware }  from "../middleware/auth.js";

const router = express.Router();

// Get inbox or sent conversations
router.get("/", authMiddleware, getMailbox);

// Get unread message count
router.get("/unread-count", authMiddleware, getUnreadCount);

// Create a private conversation
router.post("/conversations", authMiddleware, createConversation);

// Get conversation message history
router.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  getConversationHistoryController
);

// Send a reply
router.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  sendReply
);

// Mark a received message as read
router.patch(
  "/messages/:messageId/read",
  authMiddleware,
  markAsRead
);

export default router;
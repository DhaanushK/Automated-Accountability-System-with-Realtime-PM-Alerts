import {
  createPrivateConversation,
  sendConversationReply,
  getConversationHistory,
  getMailboxConversations,
  markMessageAsRead,
  getUnreadMessageCount
} from "../services/internalConversationService.js";

const handleControllerError = (res, error) => {
  console.error("[Internal Mail] Request failed:", {
  errorName: error?.name || "Error",
  errorCode: error?.code || "UNKNOWN_ERROR",
  statusCode: error?.statusCode || 500
});

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode
      ? error.message
      : "An unexpected error occurred."
  });
};

export const createConversation = async (req, res) => {
  try {
    const { recipientId, subject, content } = req.body;

    const result = await createPrivateConversation({
      senderId: req.user.id,
      recipientId,
      subject,
      content
    });

    return res.status(201).json(result);

  } catch (error) {
    return handleControllerError(res, error);
  }
};
export const sendReply = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;

    const result = await sendConversationReply({
      senderId: req.user.id,
      conversationId,
      content
    });

    return res.status(201).json(result);

  } catch (error) {
    return handleControllerError(res, error);
  }
};
export const getConversationHistoryController = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { before, limit } = req.query;

    let parsedCursor = null;

    if (before !== undefined) {
      try {
        parsedCursor = JSON.parse(before);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid pagination cursor."
        });
      }
    }

    const result = await getConversationHistory({
      userId: req.user.id,
      conversationId,
      before: parsedCursor,
      limit: limit === undefined ? 50 : Number(limit)
    });

    return res.status(200).json(result);

  } catch (error) {
    return handleControllerError(res, error);
  }
};
export const getMailbox = async (req, res) => {
  try {
    const { folder = "inbox", limit = 50 } = req.query;

    const result = await getMailboxConversations({
      userId: req.user.id,
      folder,
      limit: Number(limit)
    });

    return res.status(200).json(result);

  } catch (error) {
    return handleControllerError(res, error);
  }
};
export const markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;

    const result = await markMessageAsRead({
      userId: req.user.id,
      messageId
    });

    return res.status(200).json(result);

  } catch (error) {
    return handleControllerError(res, error);
  }
};
export const getUnreadCount = async (req, res) => {
  try {
    const result = await getUnreadMessageCount({
      userId: req.user.id
    });

    return res.status(200).json(result);

  } catch (error) {
    return handleControllerError(res, error);
  }
};

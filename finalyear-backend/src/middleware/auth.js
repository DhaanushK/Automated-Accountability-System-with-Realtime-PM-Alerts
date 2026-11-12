import jwt from "jsonwebtoken";
import User from "../models/User.js";

function sendAuthError(req, res, status, code, message) {
  if (req.standardApiErrors) {
    return res.status(status).json({
      success: false,
      error: { code, message }
    });
  }

  return res.status(status).json({ message });
}

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return sendAuthError(
      req,
      res,
      401,
      "UNAUTHENTICATED",
      "No token provided"
    );
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  let decoded;

  // Step 1: Verify the JWT.
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    console.warn("[auth] Token verification failed.");

    return sendAuthError(
      req,
      res,
      401,
      "UNAUTHENTICATED",
      "Invalid token"
    );
  }

  // Step 2: Retrieve fresh user data from MongoDB.
  try {
    const user = await User.findById(decoded.id)
      .select("email role name");

    if (!user) {
      if (req.standardApiErrors) {
        return sendAuthError(
          req,
          res,
          401,
          "UNAUTHENTICATED",
          "The authenticated user is unavailable."
        );
      }

      // Preserve the existing legacy API response.
      return sendAuthError(
        req,
        res,
        404,
        "USER_NOT_FOUND",
        "User not found"
      );
    }

    // Database values remain authoritative for user information.
    req.user = {
      ...decoded,
      email: user.email,
      role: user.role,
      name: user.name
    };

    return next();

  } catch {
    console.error("[auth] User lookup failed.");

    return sendAuthError(
      req,
      res,
      500,
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication services are temporarily unavailable."
    );
  }
};

// Role-based access check
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return sendAuthError(
        req,
        res,
        403,
        "FORBIDDEN",
        "Access denied"
      );
    }

    next();
  };
};

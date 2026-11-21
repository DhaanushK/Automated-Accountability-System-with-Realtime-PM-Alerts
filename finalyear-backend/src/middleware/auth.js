
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

  // Step 1: Verify JWT
  try {
    if (!process.env.JWT_SECRET) {
      console.error("[auth] JWT_SECRET is not configured.");

      return sendAuthError(
        req,
        res,
        500,
        "AUTHENTICATION_UNAVAILABLE",
        "Authentication service is unavailable."
      );
    }

    decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return sendAuthError(
        req,
        res,
        401,
        "UNAUTHENTICATED",
        "Invalid token payload."
      );
    }

  } catch {
    return sendAuthError(
      req,
      res,
      401,
      "UNAUTHENTICATED",
      "Invalid or expired token"
    );
  }

  // Step 2: Retrieve fresh user information
  try {
    const user = await User.findById(decoded.id)
      .select("email role name active");

    if (!user) {
      return sendAuthError(
        req,
        res,
        401,
        "UNAUTHENTICATED",
        "Authenticated user is unavailable."
      );
    }

    // Step 3: Enforce account activation
    if (user.active !== true) {
      return sendAuthError(
        req,
        res,
        403,
        "ACCOUNT_INACTIVE",
        "Your account is inactive. Contact your Project Manager."
      );
    }

    // Step 4: Use fresh database values
    req.user = {
      ...decoded,
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      active: user.active
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
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendAuthError(
        req,
        res,
        403,
        "FORBIDDEN",
        "Access denied"
      );
    }

    return next();
  };
};


import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  authMiddleware,
  authorizeRoles
} from "../middleware/auth.js";

const router = express.Router();

const ALLOWED_ROLES = [
  "team_member",
  "team_lead",
  "project_manager"
];

// Register — Project Manager only
router.post(
  "/register",
  authMiddleware,
  authorizeRoles("project_manager"),
  async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      if (
        typeof name !== "string" ||
        !name.trim() ||
        typeof email !== "string" ||
        !email.trim() ||
        typeof password !== "string" ||
        !password ||
        !ALLOWED_ROLES.includes(role)
      ) {
        return res.status(400).json({
          success: false,
          message: "Valid name, email, password and role are required."
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await User.findOne({
        email: normalizedEmail
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists."
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
        active: true
      });

      return res.status(201).json({
        success: true,
        message: "User registered successfully.",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active
        }
      });

    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists."
        });
      }

      console.error("[auth] Registration failed.");

      return res.status(500).json({
        success: false,
        message: "Unable to register user."
      });
    }
  }
);

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail
    });

    if (!user || !user.active) {
      return res.status(401).json({
        message: "Invalid credentials or inactive account."
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("[auth] JWT_SECRET is not configured.");

      return res.status(500).json({
        message: "Server configuration error"
      });
    }

    const tokenPayload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      role: user.role,
      email: user.email,
      username: user.name,
      id: user._id.toString()
    });

  } catch (error) {
    console.error("[auth] Login failed.");

    return res.status(500).json({
      message: "An error occurred during login"
    });
  }
});

// Get current user details
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    return res.json({
      id: user._id,
      role: user.role,
      email: user.email,
      name: user.name
    });

  } catch (error) {
    console.error("[auth] Current-user lookup failed.");

    return res.status(500).json({
      message: "Unable to fetch user details."
    });
  }
});

export default router;

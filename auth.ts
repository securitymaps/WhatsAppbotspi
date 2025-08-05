import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const CEO_MASTER_TOKEN = process.env.CEO_MASTER_TOKEN || "ceo-master-token-2024";

export interface AuthRequest extends Request {
  user?: User;
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Access token required" });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(403).json({ message: "Invalid token" });
    return;
  }

  try {
    const user = await storage.getUser(decoded.userId);
    if (!user || !user.isActive) {
      res.status(403).json({ message: "User not found or inactive" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Authentication error" });
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export async function loginWithEmail(email: string, password: string): Promise<{ user: User; token: string } | null> {
  const user = await storage.getUserByEmail(email);
  if (!user || !user.password) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    return null;
  }

  // Update last login
  await storage.updateUser(user.id, { lastLogin: new Date() });

  const token = generateToken(user.id);
  return { user, token };
}

export async function loginWithFirebase(firebaseUid: string, userData: {
  email?: string;
  name?: string;
  provider: "google" | "facebook";
}): Promise<{ user: User; token: string }> {
  let user = await storage.getUserByFirebaseUid(firebaseUid);
  
  if (!user) {
    // Create new user from Firebase auth
    user = await storage.createUser({
      email: userData.email,
      username: userData.name,
      firebaseUid,
      authProvider: userData.provider,
      isVerified: true,
      role: "user",
    });
  } else {
    // Update last login
    await storage.updateUser(user.id, { lastLogin: new Date() });
  }

  const token = generateToken(user.id);
  return { user, token };
}

export async function loginAsCEO(email: string, token: string): Promise<{ user: User; token: string } | null> {
  // Verify CEO token
  if (token !== CEO_MASTER_TOKEN) {
    return null;
  }

  let user = await storage.getUserByEmail(email);
  
  if (!user) {
    // Create CEO user if doesn't exist
    user = await storage.createUser({
      email,
      role: "ceo",
      authProvider: "email",
      isVerified: true,
      ceoToken: token,
    });
  } else if (user.role !== "ceo") {
    // Upgrade user to CEO role
    user = await storage.updateUser(user.id, { 
      role: "ceo", 
      ceoToken: token,
      lastLogin: new Date() 
    });
  } else {
    // Update last login for existing CEO
    await storage.updateUser(user.id, { lastLogin: new Date() });
  }

  const authToken = generateToken(user.id);
  return { user, token: authToken };
}

export async function registerUser(userData: {
  email?: string;
  username?: string;
  password?: string;
  phone?: string;
  authProvider: "email" | "phone" | "anonymous";
}): Promise<{ user: User; token: string }> {
  const insertData: any = {
    ...userData,
    isVerified: userData.authProvider !== "email", // Email requires verification
  };

  if (userData.password) {
    insertData.password = await hashPassword(userData.password);
  }

  const user = await storage.createUser(insertData);
  const token = generateToken(user.id);
  
  return { user, token };
}

export function generateVerificationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

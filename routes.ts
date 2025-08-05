import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  authenticateToken, 
  requireRole, 
  loginWithEmail, 
  loginWithFirebase, 
  loginAsCEO, 
  registerUser,
  type AuthRequest 
} from "./auth";
import { whatsappService, chatbotProcessor, WhatsAppService } from "./whatsapp";
import { insertUserSchema, insertContactSchema, insertMessageSchema, insertChatbotSchema } from "@shared/schema";
import { z } from "zod";

// WebSocket connections map
const wsConnections = new Map<string, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server for real-time messaging
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req) => {
    console.log("WebSocket connection established");

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "auth" && message.token) {
          // Authenticate WebSocket connection
          const decoded = require("./auth").verifyToken(message.token);
          if (decoded) {
            wsConnections.set(decoded.userId, ws);
            ws.send(JSON.stringify({ type: "auth_success" }));
          }
        } else if (message.type === "send_message") {
          // Handle real-time message sending
          await handleRealtimeMessage(message);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      // Remove connection
      for (const [userId, connection] of wsConnections.entries()) {
        if (connection === ws) {
          wsConnections.delete(userId);
          break;
        }
      }
    });
  });

  // Broadcast message to user's WebSocket connection
  function broadcastToUser(userId: string, message: any) {
    const ws = wsConnections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Handle real-time message sending
  async function handleRealtimeMessage(data: any) {
    try {
      const { conversationId, contactId, content, userId } = data;
      
      const message = await whatsappService.processOutgoingMessage(
        conversationId,
        contactId,
        content
      );

      // Broadcast to user's other connections
      broadcastToUser(userId, {
        type: "new_message",
        message,
      });
    } catch (error) {
      console.error("Real-time message error:", error);
    }
  }

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const result = await loginWithEmail(email, password);
      if (!result) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      res.json(result);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const result = await registerUser(userData);
      res.json(result);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/firebase", async (req, res) => {
    try {
      const { firebaseUid, email, name, provider } = req.body;
      
      if (!firebaseUid || !provider) {
        return res.status(400).json({ message: "Firebase UID and provider required" });
      }

      const result = await loginWithFirebase(firebaseUid, { email, name, provider });
      res.json(result);
    } catch (error) {
      console.error("Firebase auth error:", error);
      res.status(500).json({ message: "Firebase authentication failed" });
    }
  });

  app.post("/api/auth/ceo-login", async (req, res) => {
    try {
      const { email, token } = req.body;
      
      if (!email || !token) {
        return res.status(400).json({ message: "Email and token required" });
      }

      const result = await loginAsCEO(email, token);
      if (!result) {
        return res.status(401).json({ message: "Invalid CEO credentials" });
      }

      res.json(result);
    } catch (error) {
      console.error("CEO login error:", error);
      res.status(500).json({ message: "CEO login failed" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res) => {
    res.json({ user: req.user });
  });

  // WhatsApp webhook endpoints
  app.get("/api/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const result = WhatsAppService.verifyWebhook(token as string, mode as string, challenge as string);
    
    if (result) {
      res.status(200).send(result);
    } else {
      res.status(403).send("Forbidden");
    }
  });

  app.post("/api/webhook", async (req, res) => {
    try {
      const { entry } = req.body;
      
      for (const item of entry || []) {
        for (const change of item.changes || []) {
          if (change.field === "messages") {
            const messages = change.value.messages || [];
            
            for (const message of messages) {
              // Find WhatsApp account by phone number ID
              const accounts = await storage.getWhatsappAccountsByUser("system"); // TODO: Implement proper account lookup
              const account = accounts.find(acc => acc.phoneNumberId === change.value.metadata.phone_number_id);
              
              if (account) {
                // Process incoming message
                const result = await whatsappService.processIncomingMessage(account.id, message);
                
                // Broadcast to user's WebSocket connection
                broadcastToUser(account.userId, {
                  type: "new_message",
                  message: result.message,
                  contact: result.contact,
                  conversation: result.conversation,
                });

                // Check for bot response
                const userBots = await storage.getChatbotsByUser(account.userId);
                const activeBot = userBots.find(bot => bot.isActive);
                
                if (activeBot) {
                  await chatbotProcessor.processBotResponse(
                    activeBot.id,
                    result.contact,
                    result.message,
                    result.conversation
                  );
                }
              }
            }
          }
        }
      }

      res.status(200).send("OK");
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // User management routes (CEO only)
  app.get("/api/admin/users", authenticateToken, requireRole(["ceo", "admin"]), async (req: AuthRequest, res) => {
    try {
      // TODO: Implement user listing with pagination
      res.json({ users: [], total: 0 });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/stats", authenticateToken, requireRole(["ceo", "admin"]), async (req: AuthRequest, res) => {
    try {
      // TODO: Implement global platform statistics
      res.json({
        activeUsers: 2847,
        messagesSent: 18293,
        activeBots: 12,
        conversions: 94.2
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // WhatsApp account management
  app.get("/api/whatsapp/accounts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const accounts = await storage.getWhatsappAccountsByUser(req.user!.id);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch WhatsApp accounts" });
    }
  });

  app.post("/api/whatsapp/accounts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const accountData = {
        ...req.body,
        userId: req.user!.id,
      };
      
      const account = await storage.createWhatsappAccount(accountData);
      res.json(account);
    } catch (error) {
      res.status(500).json({ message: "Failed to create WhatsApp account" });
    }
  });

  // Contact management
  app.get("/api/contacts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContactsByUser(req.user!.id);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/contacts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const contactData = insertContactSchema.parse({
        ...req.body,
        userId: req.user!.id,
      });
      
      const contact = await storage.createContact(contactData);
      res.json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  // Conversation management
  app.get("/api/conversations", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const conversations = await storage.getConversationsByUser(req.user!.id);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id/messages", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getMessagesByConversation(id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Message sending
  app.post("/api/messages", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { conversationId, contactId, content, type = "text" } = req.body;
      
      if (!conversationId || !contactId || !content) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const message = await whatsappService.processOutgoingMessage(
        conversationId,
        contactId,
        content,
        type
      );

      // Broadcast to WebSocket connections
      broadcastToUser(req.user!.id, {
        type: "new_message",
        message,
      });

      res.json(message);
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Chatbot management
  app.get("/api/chatbots", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const chatbots = await storage.getChatbotsByUser(req.user!.id);
      res.json(chatbots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chatbots" });
    }
  });

  app.post("/api/chatbots", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const chatbotData = insertChatbotSchema.parse({
        ...req.body,
        userId: req.user!.id,
      });
      
      const chatbot = await storage.createChatbot(chatbotData);
      res.json(chatbot);
    } catch (error) {
      res.status(500).json({ message: "Failed to create chatbot" });
    }
  });

  app.get("/api/chatbots/:id/analytics", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const analytics = await storage.getBotAnalytics(id);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bot analytics" });
    }
  });

  // User statistics
  app.get("/api/stats", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getUserStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user stats" });
    }
  });

  return httpServer;
}

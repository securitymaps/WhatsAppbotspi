import { 
  users, whatsappAccounts, contacts, conversations, messages, 
  chatbots, botInteractions, webhookEvents,
  type User, type InsertUser, type WhatsappAccount, type InsertWhatsappAccount,
  type Contact, type InsertContact, type Conversation, type InsertConversation,
  type Message, type InsertMessage, type Chatbot, type InsertChatbot,
  type BotInteraction, type InsertBotInteraction, type WebhookEvent, type InsertWebhookEvent
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, count } from "drizzle-orm";

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  
  // WhatsApp account management
  getWhatsappAccount(id: string): Promise<WhatsappAccount | undefined>;
  getWhatsappAccountsByUser(userId: string): Promise<WhatsappAccount[]>;
  createWhatsappAccount(account: InsertWhatsappAccount): Promise<WhatsappAccount>;
  updateWhatsappAccount(id: string, updates: Partial<WhatsappAccount>): Promise<WhatsappAccount>;
  
  // Contact management
  getContact(id: string): Promise<Contact | undefined>;
  getContactsByUser(userId: string): Promise<Contact[]>;
  getContactByPhone(phone: string, userId: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, updates: Partial<Contact>): Promise<Contact>;
  
  // Conversation management
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsByUser(userId: string): Promise<Conversation[]>;
  getConversationByContact(contactId: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation>;
  
  // Message management
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, updates: Partial<Message>): Promise<Message>;
  
  // Chatbot management
  getChatbot(id: string): Promise<Chatbot | undefined>;
  getChatbotsByUser(userId: string): Promise<Chatbot[]>;
  createChatbot(chatbot: InsertChatbot): Promise<Chatbot>;
  updateChatbot(id: string, updates: Partial<Chatbot>): Promise<Chatbot>;
  
  // Bot interaction tracking
  createBotInteraction(interaction: InsertBotInteraction): Promise<BotInteraction>;
  getBotInteractionsByBot(chatbotId: string): Promise<BotInteraction[]>;
  
  // Webhook management
  createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent>;
  getUnprocessedWebhookEvents(): Promise<WebhookEvent[]>;
  markWebhookEventProcessed(id: string): Promise<void>;
  
  // Analytics
  getUserStats(userId: string): Promise<{
    totalContacts: number;
    totalMessages: number;
    activeBots: number;
    unreadMessages: number;
  }>;
  
  getBotAnalytics(chatbotId: string): Promise<{
    totalInteractions: number;
    averageResponseTime: number;
    escalationRate: number;
    satisfactionScore: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async getWhatsappAccount(id: string): Promise<WhatsappAccount | undefined> {
    const [account] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.id, id));
    return account || undefined;
  }

  async getWhatsappAccountsByUser(userId: string): Promise<WhatsappAccount[]> {
    return await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.userId, userId));
  }

  async createWhatsappAccount(insertAccount: InsertWhatsappAccount): Promise<WhatsappAccount> {
    const [account] = await db.insert(whatsappAccounts).values(insertAccount).returning();
    return account;
  }

  async updateWhatsappAccount(id: string, updates: Partial<WhatsappAccount>): Promise<WhatsappAccount> {
    const [account] = await db.update(whatsappAccounts).set(updates).where(eq(whatsappAccounts.id, id)).returning();
    return account;
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact || undefined;
  }

  async getContactsByUser(userId: string): Promise<Contact[]> {
    return await db.select().from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(desc(contacts.lastMessageAt));
  }

  async getContactByPhone(phone: string, userId: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.phone, phone), eq(contacts.userId, userId)));
    return contact || undefined;
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values([insertContact]).returning();
    return contact;
  }

  async updateContact(id: string, updates: Partial<Contact>): Promise<Contact> {
    const [contact] = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning();
    return contact;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation || undefined;
  }

  async getConversationsByUser(userId: string): Promise<Conversation[]> {
    return await db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.lastMessageAt));
  }

  async getConversationByContact(contactId: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations)
      .where(eq(conversations.contactId, contactId));
    return conversation || undefined;
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values(insertConversation).returning();
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation> {
    const [conversation] = await db.update(conversations).set(updates).where(eq(conversations.id, id)).returning();
    return conversation;
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<Message> {
    const [message] = await db.update(messages).set(updates).where(eq(messages.id, id)).returning();
    return message;
  }

  async getChatbot(id: string): Promise<Chatbot | undefined> {
    const [chatbot] = await db.select().from(chatbots).where(eq(chatbots.id, id));
    return chatbot || undefined;
  }

  async getChatbotsByUser(userId: string): Promise<Chatbot[]> {
    return await db.select().from(chatbots).where(eq(chatbots.userId, userId));
  }

  async createChatbot(insertChatbot: InsertChatbot): Promise<Chatbot> {
    const [chatbot] = await db.insert(chatbots).values([insertChatbot]).returning();
    return chatbot;
  }

  async updateChatbot(id: string, updates: Partial<Chatbot>): Promise<Chatbot> {
    const [chatbot] = await db.update(chatbots).set(updates).where(eq(chatbots.id, id)).returning();
    return chatbot;
  }

  async createBotInteraction(insertInteraction: InsertBotInteraction): Promise<BotInteraction> {
    const [interaction] = await db.insert(botInteractions).values(insertInteraction).returning();
    return interaction;
  }

  async getBotInteractionsByBot(chatbotId: string): Promise<BotInteraction[]> {
    return await db.select().from(botInteractions)
      .where(eq(botInteractions.chatbotId, chatbotId))
      .orderBy(desc(botInteractions.timestamp));
  }

  async createWebhookEvent(insertEvent: InsertWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db.insert(webhookEvents).values(insertEvent).returning();
    return event;
  }

  async getUnprocessedWebhookEvents(): Promise<WebhookEvent[]> {
    return await db.select().from(webhookEvents)
      .where(eq(webhookEvents.processed, false))
      .orderBy(webhookEvents.timestamp);
  }

  async markWebhookEventProcessed(id: string): Promise<void> {
    await db.update(webhookEvents)
      .set({ processed: true })
      .where(eq(webhookEvents.id, id));
  }

  async getUserStats(userId: string): Promise<{
    totalContacts: number;
    totalMessages: number;
    activeBots: number;
    unreadMessages: number;
  }> {
    const [contactsCount] = await db.select({ count: count() }).from(contacts).where(eq(contacts.userId, userId));
    const [messagesCount] = await db.select({ count: count() }).from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.userId, userId));
    const [botsCount] = await db.select({ count: count() }).from(chatbots)
      .where(and(eq(chatbots.userId, userId), eq(chatbots.isActive, true)));
    const [unreadCount] = await db.select({ total: sql<number>`sum(${conversations.unreadCount})` }).from(conversations)
      .where(eq(conversations.userId, userId));

    return {
      totalContacts: contactsCount?.count || 0,
      totalMessages: messagesCount?.count || 0,
      activeBots: botsCount?.count || 0,
      unreadMessages: unreadCount?.total || 0,
    };
  }

  async getBotAnalytics(chatbotId: string): Promise<{
    totalInteractions: number;
    averageResponseTime: number;
    escalationRate: number;
    satisfactionScore: number;
  }> {
    const [interactionsCount] = await db.select({ count: count() }).from(botInteractions)
      .where(eq(botInteractions.chatbotId, chatbotId));
    
    const [avgResponseTime] = await db.select({ 
      avg: sql<number>`avg(${botInteractions.responseTime})` 
    }).from(botInteractions).where(eq(botInteractions.chatbotId, chatbotId));
    
    const [escalationStats] = await db.select({ 
      total: count(),
      escalated: sql<number>`sum(case when ${botInteractions.wasEscalated} then 1 else 0 end)`
    }).from(botInteractions).where(eq(botInteractions.chatbotId, chatbotId));
    
    const [satisfactionAvg] = await db.select({ 
      avg: sql<number>`avg(${botInteractions.satisfactionScore})` 
    }).from(botInteractions)
      .where(and(
        eq(botInteractions.chatbotId, chatbotId),
        sql`${botInteractions.satisfactionScore} IS NOT NULL`
      ));

    return {
      totalInteractions: interactionsCount?.count || 0,
      averageResponseTime: avgResponseTime?.avg || 0,
      escalationRate: escalationStats?.total ? (escalationStats.escalated / escalationStats.total) * 100 : 0,
      satisfactionScore: satisfactionAvg?.avg || 0,
    };
  }
}

export const storage = new DatabaseStorage();

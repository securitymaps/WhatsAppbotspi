import { storage } from "./storage";
import type { WebhookEvent, Contact, Message, Conversation } from "@shared/schema";

// WhatsApp Business API configuration
const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || null;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || null;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mi_token_de_verificacion";

export interface WhatsAppMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "text" | "image" | "audio" | "video" | "document";
  text?: { body: string };
  image?: { link: string; caption?: string };
  audio?: { link: string };
  video?: { link: string; caption?: string };
  document?: { link: string; filename?: string };
}

export interface IncomingWhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "video" | "document";
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  audio?: { id: string; mime_type: string; sha256: string };
  video?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; filename: string; mime_type: string; sha256: string };
}

export class WhatsAppService {
  private accessToken: string | null;
  private phoneNumberId: string | null;

  constructor(accessToken: string | null = ACCESS_TOKEN, phoneNumberId: string | null = PHONE_NUMBER_ID) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }

  private validateCredentials(): boolean {
    return !!(this.accessToken && this.phoneNumberId);
  }

  isConfigured(): boolean {
    return this.validateCredentials();
  }

  async sendMessage(message: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.validateCredentials()) {
      return { success: false, error: "WhatsApp credentials not configured" };
    }

    try {
      const response = await fetch(`${WHATSAPP_API_URL}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error?.message || "Failed to send message" };
      }

      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async sendTextMessage(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.validateCredentials()) {
      return { success: false, error: "WhatsApp credentials not configured" };
    }

    return this.sendMessage({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    });
  }

  async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const response = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
        },
      });

      const data = await response.json();
      return data.url || null;
    } catch {
      return null;
    }
  }

  static verifyWebhook(verifyToken: string, mode: string, challenge: string): string | null {
    if (mode === "subscribe" && verifyToken === VERIFY_TOKEN) {
      return challenge;
    }
    return null;
  }

  async processIncomingMessage(
    whatsappAccountId: string,
    incomingMessage: IncomingWhatsAppMessage
  ): Promise<{ contact: Contact; message: Message; conversation: Conversation }> {
    const phone = incomingMessage.from;
    
    // Find or create contact
    const whatsappAccount = await storage.getWhatsappAccount(whatsappAccountId);
    if (!whatsappAccount) {
      throw new Error("WhatsApp account not found");
    }

    let contact = await storage.getContactByPhone(phone, whatsappAccount.userId);
    if (!contact) {
      contact = await storage.createContact({
        userId: whatsappAccount.userId,
        whatsappAccountId,
        name: phone, // Use phone as name initially
        phone,
      });
    } else {
      // Update last message time  
      contact = await storage.updateContact(contact.id, {});
    }

    // Find or create conversation
    let conversation = await storage.getConversationByContact(contact.id);
    if (!conversation) {
      conversation = await storage.createConversation({
        userId: whatsappAccount.userId,
        contactId: contact.id,
        whatsappAccountId,
        unreadCount: 1,
      });
    } else {
      // Update conversation
      conversation = await storage.updateConversation(conversation.id, {
        unreadCount: (conversation.unreadCount || 0) + 1,
      });
    }

    // Create message
    let content = "";
    let mediaUrl: string | undefined;

    switch (incomingMessage.type) {
      case "text":
        content = incomingMessage.text?.body || "";
        break;
      case "image":
      case "audio":
      case "video":
      case "document":
        const mediaId = (incomingMessage as any)[incomingMessage.type]?.id;
        if (mediaId) {
          mediaUrl = await this.getMediaUrl(mediaId);
        }
        content = `[${incomingMessage.type.toUpperCase()}]`;
        break;
    }

    const message = await storage.createMessage({
      conversationId: conversation.id,
      contactId: contact.id,
      whatsappMessageId: incomingMessage.id,
      direction: "inbound",
      type: incomingMessage.type,
      content,
      mediaUrl,
      status: "delivered",
    });

    return { contact, message, conversation };
  }

  async processOutgoingMessage(
    conversationId: string,
    contactId: string,
    content: string,
    type: "text" | "image" | "audio" | "video" | "document" = "text"
  ): Promise<Message> {
    const contact = await storage.getContact(contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }

    // Send message via WhatsApp API
    const result = await this.sendTextMessage(contact.phone, content);
    
    if (!result.success) {
      throw new Error(`Failed to send WhatsApp message: ${result.error}`);
    }

    // Save outgoing message
    const message = await storage.createMessage({
      conversationId,
      contactId,
      whatsappMessageId: result.messageId,
      direction: "outbound",
      type,
      content,
      status: "sent",
    });

    // Update conversation
    const conversation = await storage.getConversation(conversationId);
    if (conversation) {
      await storage.updateConversation(conversationId, {
        lastMessageAt: new Date(),
      });
    }

    return message;
  }
}

// Chatbot response system
export class ChatbotProcessor {
  private whatsappService: WhatsAppService;

  constructor(whatsappService: WhatsAppService) {
    this.whatsappService = whatsappService;
  }

  async processBotResponse(
    chatbotId: string,
    contact: Contact,
    message: Message,
    conversation: Conversation
  ): Promise<boolean> {
    const chatbot = await storage.getChatbot(chatbotId);
    if (!chatbot || !chatbot.isActive) {
      return false;
    }

    const startTime = Date.now();
    let response = await this.generateResponse(chatbot, message.content || "");
    
    if (!response) {
      return false;
    }

    // Check if should escalate to human
    const shouldEscalate = this.shouldEscalateToHuman(message.content || "", chatbot);
    
    if (shouldEscalate) {
      response += "\n\nUn agente humano se pondrá en contacto contigo pronto.";
    }

    // Send bot response
    const botMessage = await this.whatsappService.processOutgoingMessage(
      conversation.id,
      contact.id,
      response,
      "text"
    );

    // Mark as bot message
    await storage.updateMessage(botMessage.id, { isFromBot: true });

    // Record interaction for analytics
    await storage.createBotInteraction({
      chatbotId,
      contactId: contact.id,
      messageId: message.id,
      trigger: message.content || "",
      response,
      wasEscalated: shouldEscalate,
      responseTime: Date.now() - startTime,
    });

    return true;
  }

  private async generateResponse(chatbot: any, messageContent: string): Promise<string | null> {
    const content = messageContent.toLowerCase();
    
    // Basic response templates based on chatbot type
    const templates = {
      corporate: {
        greetings: ["hola", "buenos días", "buenas tardes", "buenas noches"],
        pricing: ["precio", "costo", "tarifa", "cuánto cuesta"],
        info: ["información", "info", "detalles", "más info"],
        support: ["ayuda", "soporte", "problema", "asistencia"],
      },
      ecommerce: {
        products: ["productos", "catálogo", "qué venden", "disponible"],
        orders: ["pedido", "orden", "comprar", "ordenar"],
        shipping: ["envío", "entrega", "delivery", "tiempo"],
        returns: ["devolución", "cambio", "garantía", "reembolso"],
      },
      healthcare: {
        appointments: ["cita", "turno", "consulta", "agenda"],
        services: ["servicios", "tratamientos", "especialidades"],
        hours: ["horario", "horarios", "cuándo", "abierto"],
        emergency: ["emergencia", "urgente", "urgencia"],
      },
    };

    const template = templates[chatbot.template as keyof typeof templates];
    if (!template) {
      return "Gracias por tu mensaje. Un representante se pondrá en contacto contigo pronto.";
    }

    // Check for greeting
    if (template.greetings?.some(greeting => content.includes(greeting))) {
      return `¡Hola! Soy el asistente virtual de ${chatbot.name}. ¿En qué puedo ayudarte hoy?`;
    }

    // Template-specific responses
    switch (chatbot.template) {
      case "corporate":
        if (template.pricing?.some(word => content.includes(word))) {
          return "Tenemos varios planes disponibles:\n\n📊 Plan Básico: $299/mes\n🚀 Plan Professional: $599/mes\n⭐ Plan Enterprise: $999/mes\n\n¿Te gustaría más información sobre algún plan específico?";
        }
        if (template.info?.some(word => content.includes(word))) {
          return "Somos una empresa líder en soluciones empresariales. Ofrecemos servicios de consultoría, implementación y soporte técnico. ¿Sobre qué aspecto te gustaría saber más?";
        }
        break;

      case "ecommerce":
        if (template.products?.some(word => content.includes(word))) {
          return "Contamos con un amplio catálogo de productos. Puedes ver todos nuestros productos en nuestro sitio web o pregúntame por una categoría específica. ¿Qué tipo de producto buscas?";
        }
        if (template.orders?.some(word => content.includes(word))) {
          return "Para realizar un pedido puedes:\n1. Visitar nuestro sitio web\n2. Llamar al 123-456-7890\n3. Enviarme los detalles por aquí\n\n¿Cómo prefieres proceder?";
        }
        break;

      case "healthcare":
        if (template.appointments?.some(word => content.includes(word))) {
          return "Para agendar una cita puedes:\n📞 Llamar al 123-456-7890\n💻 Usar nuestro portal en línea\n📱 Enviarme tus datos aquí\n\nNuestros horarios: Lun-Vie 8:00-18:00, Sáb 8:00-14:00";
        }
        if (template.emergency?.some(word => content.includes(word))) {
          return "🚨 EMERGENCIA: Si tienes una emergencia médica, llama inmediatamente al 911 o dirígete al hospital más cercano.\n\nPara urgencias médicas no críticas: 123-456-7890";
        }
        break;
    }

    // Default response
    return "Gracias por tu mensaje. ¿Podrías ser más específico sobre lo que necesitas? Estoy aquí para ayudarte.";
  }

  private shouldEscalateToHuman(messageContent: string, chatbot: any): boolean {
    const escalationKeywords = [
      "hablar con persona", "agente humano", "representante", "supervisor",
      "queja", "reclamo", "problema serio", "no entiendo", "mal servicio"
    ];

    const content = messageContent.toLowerCase();
    return escalationKeywords.some(keyword => content.includes(keyword));
  }
}

// Export singleton instances
export const whatsappService = new WhatsAppService();
export const chatbotProcessor = new ChatbotProcessor(whatsappService);

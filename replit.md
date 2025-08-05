# FlowConnect - WhatsApp Business API Platform

## Overview

FlowConnect is a comprehensive WhatsApp Business communication platform that enables businesses to manage customer conversations, automate responses, and integrate WhatsApp messaging into their workflows. The platform is designed for businesses to streamline their customer communication through WhatsApp, offering features like automated chatbot responses, conversation management, user role management, and real-time messaging capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development
- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter for lightweight client-side routing
- **UI Framework**: shadcn/ui components built on Radix UI primitives with Tailwind CSS
- **State Management**: TanStack Query for server state management and caching
- **Mobile Support**: Capacitor for cross-platform mobile app deployment with native features

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules for modern JavaScript features
- **API Design**: RESTful API with real-time WebSocket support for live messaging
- **Session Management**: Express sessions with PostgreSQL storage
- **Authentication**: Multi-provider auth supporting email, Google, Facebook, and Firebase
- **Real-time Communication**: WebSocket server for instant message delivery

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless hosting
- **ORM**: Drizzle ORM for type-safe database operations and migrations
- **Schema Management**: Drizzle Kit for database schema generation and migrations
- **Connection**: @neondatabase/serverless for optimized serverless database connections

### Authentication and Authorization
- **Primary Auth**: Email/password with bcrypt hashing
- **Social Auth**: Google and Facebook OAuth integration via Firebase
- **Role-based Access**: Three-tier system (CEO, Admin, User) with different dashboard views
- **Session Security**: HTTP-only cookies with secure session storage
- **Token Management**: JWT tokens for API authentication

## External Dependencies

### Database & Storage
- **Neon Database**: PostgreSQL serverless hosting for scalable data storage
- **Drizzle ORM**: Type-safe database operations and schema management

### Authentication Services
- **Firebase Auth**: Google and Facebook OAuth integration
- **bcrypt**: Password hashing for secure authentication

### WhatsApp Integration
- **WhatsApp Business API**: Official Meta API for sending/receiving messages
- **Webhook Processing**: Real-time message delivery and status updates

### UI & Design
- **shadcn/ui**: Pre-built accessible components based on Radix UI
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Radix UI**: Headless component primitives for accessibility

### Mobile Development
- **Capacitor**: Cross-platform native mobile app wrapper
- **Android SDK**: Native Android features and capabilities

### Development Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Static type checking and enhanced development experience
- **ESBuild**: Fast JavaScript bundler for production builds
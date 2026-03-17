// ============================================
// SESSION KEEPER - TYPES
// Camada de Sessão - The Session Keeper
// ============================================

import { WASocket } from '@whiskeysockets/baileys';

export interface SessionConfig {
  name: string;
  syncFullHistory: boolean;
  markOnlineOnConnect: boolean;
  keepAliveIntervalMs: number;
  browserName: string;
  waWebVersion: string;
}

export interface SessionState {
  id: string;
  name: string;
  status: ConnectionStatus;
  qrCode?: string;
  phoneNumber?: string;
  pushName?: string;
  socket?: WASocket;
  creds?: AuthenticationCreds;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt?: Date;
  metrics: SessionMetrics;
}

export interface AuthenticationCreds {
  noiseKey: {
    private: Buffer;
    public: Buffer;
  };
  signedIdentityKey: {
    private: Buffer;
    public: Buffer;
  };
  signedPreKey: {
    keyPair: {
      private: Buffer;
      public: Buffer;
    };
    signature: Buffer;
    keyId: number;
  };
  registrationId: number;
  advSecretKey: string;
  me?: {
    id: string;
    name?: string;
  };
  accountSyncCounter: number;
  accountSettings: {
    unarchiveChats: boolean;
  };
  platform?: string;
}

export interface SessionMetrics {
  messagesSent: number;
  messagesReceived: number;
  messagesFailed: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  connectionUptimeMs: number;
  reconnections: number;
}

export type ConnectionStatus = 
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_READY'
  | 'AUTHENTICATED'
  | 'READY'
  | 'ERROR';

export interface MessagePayload {
  remoteJid: string;
  type: MessageType;
  content: TextContent | MediaContent | LocationContent | ContactContent;
  options?: MessageOptions;
}

export type MessageType = 
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'location'
  | 'contact'
  | 'sticker';

export interface TextContent {
  text: string;
  mentions?: string[];
  contextInfo?: ContextInfo;
}

export interface MediaContent {
  url?: string;
  base64?: string;
  buffer?: Buffer;
  caption?: string;
  mimetype?: string;
  fileName?: string;
  ptt?: boolean; // Push-to-talk for audio
  gifPlayback?: boolean;
  contextInfo?: ContextInfo;
}

export interface LocationContent {
  degreesLatitude: number;
  degreesLongitude: number;
  name?: string;
  address?: string;
  contextInfo?: ContextInfo;
}

export interface ContactContent {
  displayName: string;
  vcard: string;
  contextInfo?: ContextInfo;
}

export interface ContextInfo {
  quotedMessage?: any;
  mentionedJid?: string[];
  forwardingScore?: number;
  isForwarded?: boolean;
}

export interface MessageOptions {
  delay?: number;
  presence?: 'typing' | 'recording' | 'online' | 'offline';
  linkPreview?: boolean;
  ephemeralExpiration?: number;
}

// CORREÇÃO: Adicionado '?' no inviteCode para aceitar undefined
export interface GroupInfo {
  id: string;
  subject: string;
  subjectOwner?: string;
  subjectTime?: number;
  desc?: string;
  descOwner?: string;
  descTime?: number;
  owner?: string;
  creation?: number;
  participants: GroupParticipant[];
  ephemeralDuration?: number;
  inviteCode?: string;
}

export interface GroupParticipant {
  id: string;
  admin: 'admin' | 'superadmin' | null;
  isSuperAdmin?: boolean;
}

export interface PresenceData {
  remoteJid: string;
  presence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused';
  lastSeen?: number;
}

export interface ChatSummary {
  id: string;
  name: string;
  remoteJid: string;
  unreadCount: number;
  lastMessage?: {
    text: string;
    timestamp: number;
    fromMe: boolean;
  };
  isGroup: boolean;
  profilePicUrl?: string;
}

export interface WebhookEvent {
  event: string;
  instanceId: string;
  timestamp: number;
  data: any;
}

// Anti-Ban Configuration
export interface AntiBanConfig {
  enabled: boolean;
  minIntervalMs: number;
  maxIntervalMs: number;
  typingSimulation: boolean;
  humanWakeUp: boolean;
  randomizeOrder: boolean;
  respectBusinessHours: boolean;
}

// Media Conversion Result
export interface MediaConversionResult {
  buffer: Buffer;
  mimetype: string;
  originalSize: number;
  convertedSize: number;
  duration?: number;
  width?: number;
  height?: number;
}
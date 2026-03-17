// ============================================
// SESSION KEEPER TYPES
// ============================================

import { WASocket } from '@whiskeysockets/baileys';

export interface SessionState {
  id: string;
  name: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'AUTHENTICATED' | 'READY' | 'ERROR';
  phoneNumber?: string;
  pushName?: string;
  qrCode?: string;
  socket?: WASocket;
  creds?: any;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt?: Date;
  metrics: SessionMetrics;
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

export interface SessionConfig {
  name: string;
  syncFullHistory: boolean;
  markOnlineOnConnect: boolean;
  keepAliveIntervalMs: number;
  browserName: string;
  waWebVersion: string;
}

export interface MessagePayload {
  remoteJid: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact';
  content: any;
}

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
  participants: any[];
  ephemeralDuration?: number;
  inviteCode: string;
}

export interface ChatSummary {
  id: string;
  name: string;
  remoteJid: string;
  unreadCount: number;
  lastMessage?: any;
  isGroup: boolean;
  profilePicUrl?: string;
}

export interface AntiBanConfig {
  enabled: boolean;
  minIntervalMs: number;
  maxIntervalMs: number;
  typingSimulation: boolean;
}

export interface WebhookEvent {
  event: string;
  instanceId: string;
  timestamp: number;
  data: any;
}

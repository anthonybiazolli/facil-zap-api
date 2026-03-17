// ============================================
// SESSION MANAGER - The Session Keeper
// Implementação do Noise Protocol Framework
// ============================================

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  WASocket,
  proto,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import NodeCache from 'node-cache';
import axios from 'axios';

import {
  SessionState,
  SessionConfig,
  MessagePayload,
  GroupInfo,
  ChatSummary,
  AntiBanConfig,
  WebhookEvent,
} from '../types';
import { createLogger } from '../utils/logger';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private sessionConfigs: Map<string, SessionConfig> = new Map();
  private messageCache: NodeCache;
  private logger: any;
  private redis: any;
  private webhookUrl?: string;
  private encryptionKey: string;
  private sessionsPath: string;

  constructor(redisClient: any, encryptionKey: string, webhookUrl?: string) {
    super();
    this.redis = redisClient;
    this.encryptionKey = encryptionKey;
    this.webhookUrl = webhookUrl;
    this.logger = createLogger('SessionManager');
    this.sessionsPath = process.env.SESSIONS_PATH || '/app/sessions';
    
    this.messageCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    
    this.restoreSessions();
  }

  // ============================================
  // SESSION LIFECYCLE
  // ============================================

  async createSession(sessionId: string, config: Partial<SessionConfig> = {}): Promise<SessionState> {
    this.logger.info({ sessionId }, 'Creating new WhatsApp session');

    const defaultConfig: SessionConfig = {
      name: config.name || `Session-${sessionId}`,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      keepAliveIntervalMs: 30000,
      browserName: 'FacilZap API',
      waWebVersion: '2.3000.1015901307',
      ...config,
    };

    this.sessionConfigs.set(sessionId, defaultConfig);

    const sessionState: SessionState = {
      id: sessionId,
      name: defaultConfig.name,
      status: 'CONNECTING',
      createdAt: new Date(),
      updatedAt: new Date(),
      metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        messagesFailed: 0,
        bytesUploaded: 0,
        bytesDownloaded: 0,
        connectionUptimeMs: 0,
        reconnections: 0,
      },
    };

    this.sessions.set(sessionId, sessionState);
    await this.initializeSocket(sessionId);

    return sessionState;
  }

  private async initializeSocket(sessionId: string): Promise<void> {
    const config = this.sessionConfigs.get(sessionId);
    if (!config) throw new Error(`Session config not found: ${sessionId}`);

    const sessionPath = join(this.sessionsPath, sessionId);
    await mkdir(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    this.logger.info({ version, isLatest, sessionId }, 'Using WA Web version');

    const socket = makeWASocket({
      version,
      logger: createLogger('Baileys') as any,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, createLogger('SignalKeys') as any),
      },
      browser: Browsers.macOS(config.browserName),
      markOnlineOnConnect: config.markOnlineOnConnect,
      keepAliveIntervalMs: config.keepAliveIntervalMs,
      syncFullHistory: config.syncFullHistory,
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: (jid) => {
        return jid?.includes('broadcast') || jid?.includes('status@broadcast');
      },
      getMessage: async (key: any) => {
        const msgId = key?.id as string;
        if (!msgId) return undefined;
        const cachedMsg = this.messageCache.get(msgId) as proto.IWebMessageInfo;
        return cachedMsg?.message || undefined;
      },
    });

    const session = this.sessions.get(sessionId);
    if (session) {
      session.socket = socket;
    }

    socket.ev.on('connection.update', (update: Partial<ConnectionState>) => 
      this.handleConnectionUpdate(sessionId, update)
    );

    socket.ev.on('creds.update', async (creds) => {
      await saveCreds();
      const session = this.sessions.get(sessionId);
      if (session) {
        session.creds = creds as any;
      }
    });

    socket.ev.on('messages.upsert', (m: any) => 
      this.handleMessagesUpsert(sessionId, m)
    );

    socket.ev.on('messages.update', (updates: any[]) => 
      this.handleMessagesUpdate(sessionId, updates)
    );

    socket.ev.on('presence.update', (update: any) => 
      this.handlePresenceUpdate(sessionId, update)
    );

    socket.ev.on('groups.upsert', (groups: any) => {
      this.emit('groups.upsert', { sessionId, groups });
    });

    socket.ev.on('groups.update', (updates: any) => {
      this.emit('groups.update', { sessionId, updates });
    });

    socket.ev.on('group-participants.update', (update: any) => {
      this.emit('group-participants.update', { sessionId, update });
    });
  }

  private async handleConnectionUpdate(
    sessionId: string, 
    update: Partial<ConnectionState>
  ): Promise<void> {
    const { connection, lastDisconnect, qr } = update;
    const session = this.sessions.get(sessionId);
    
    if (!session) return;

    if (qr) {
      session.status = 'QR_READY';
      session.qrCode = qr;
      session.updatedAt = new Date();
      
      this.logger.info({ sessionId }, 'QR Code ready for scanning');
      this.emit('qr', { sessionId, qr });
      await this.sendWebhook({
        event: 'session.qr',
        instanceId: sessionId,
        timestamp: Date.now(),
        data: { qr },
      });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                             statusCode !== DisconnectReason.forbidden;

      session.status = 'DISCONNECTED';
      session.metrics.reconnections++;

      this.logger.warn({ sessionId, statusCode, shouldReconnect }, 'Connection closed');

      if (shouldReconnect) {
        const delay = Math.min(1000 * Math.pow(2, session.metrics.reconnections), 30000);
        this.logger.info({ sessionId, delay }, 'Reconnecting...');
        
        setTimeout(() => {
          this.initializeSocket(sessionId);
        }, delay);
      } else {
        await this.deleteSession(sessionId);
      }
    } else if (connection === 'open') {
      session.status = 'READY';
      session.qrCode = undefined;
      session.updatedAt = new Date();

      const socket = session.socket;
      if (socket?.user) {
        session.phoneNumber = socket.user.id.split(':')[0];
        session.pushName = socket.user.name;
      }

      this.logger.info({ sessionId, phone: session.phoneNumber }, 'Connection established');
      
      this.emit('ready', { sessionId, phoneNumber: session.phoneNumber });
      await this.sendWebhook({
        event: 'session.ready',
        instanceId: sessionId,
        timestamp: Date.now(),
        data: {
          phoneNumber: session.phoneNumber,
          pushName: session.pushName,
        },
      });

      this.startHumanWakeUpCycle(sessionId);
    }

    await this.persistSession(sessionId);
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  private async handleMessagesUpsert(
    sessionId: string, 
    { messages, type }: { messages: proto.IWebMessageInfo[]; type: 'notify' | 'append' }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const message of messages) {
      if (message.key.fromMe) continue;

      const msgId = message.key.id as string;
      if (!msgId) continue;
      
      if (this.messageCache.has(msgId)) continue;
      this.messageCache.set(msgId, message);

      session.metrics.messagesReceived++;
      session.lastActivityAt = new Date();

      const remoteJid = message.key.remoteJid || '';
      const messageText = this.extractMessageText(message);

      this.emit('message', {
        sessionId,
        message,
        remoteJid,
        text: messageText,
      });

      await this.sendWebhook({
        event: 'message.received',
        instanceId: sessionId,
        timestamp: Date.now(),
        data: {
          id: msgId,
          from: remoteJid,
          text: messageText,
          timestamp: message.messageTimestamp,
          type: this.getMessageType(message),
        },
      });
    }

    await this.persistSession(sessionId);
  }

  private handleMessagesUpdate(
    sessionId: string, 
    updates: any[]
  ): void {
    for (const update of updates) {
      const { key, update: updateData } = update;
      
      if (updateData?.status && key.id) {
        this.emit('message.status', {
          sessionId,
          messageId: key.id,
          status: updateData.status,
          remoteJid: key.remoteJid,
        });

        this.sendWebhook({
          event: `message.${updateData.status}`,
          instanceId: sessionId,
          timestamp: Date.now(),
          data: {
            messageId: key.id,
            remoteJid: key.remoteJid,
          },
        });
      }
    }
  }

  private handlePresenceUpdate(
    sessionId: string, 
    update: any
  ): void {
    this.emit('presence', {
      sessionId,
      remoteJid: update.id,
      presences: update.presences,
    });
  }

  // ============================================
  // MESSAGE SENDING
  // ============================================

  async sendMessage(
    sessionId: string, 
    payload: MessagePayload,
    antiBanConfig?: AntiBanConfig
  ): Promise<{ messageId: string; timestamp: number }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'READY') {
      throw new Error(`Session not ready: ${session?.status}`);
    }

    const socket = session.socket;
    if (!socket) throw new Error('Socket not initialized');

    if (antiBanConfig?.enabled) {
      await this.applyAntiBanDelays(payload, antiBanConfig);
    }

    let result: proto.WebMessageInfo | undefined;

    switch (payload.type) {
      case 'text':
        result = await this.sendTextMessage(socket, payload);
        break;
      case 'image':
        result = await this.sendImageMessage(socket, payload);
        break;
      case 'video':
        result = await this.sendVideoMessage(socket, payload);
        break;
      case 'audio':
        result = await this.sendAudioMessage(socket, payload);
        break;
      case 'document':
        result = await this.sendDocumentMessage(socket, payload);
        break;
      case 'location':
        result = await this.sendLocationMessage(socket, payload);
        break;
      case 'contact':
        result = await this.sendContactMessage(socket, payload);
        break;
      default:
        throw new Error(`Unsupported message type: ${payload.type}`);
    }

    if (result && result.key.id) {
      session.metrics.messagesSent++;
      session.lastActivityAt = new Date();
      await this.persistSession(sessionId);

      return {
        messageId: result.key.id,
        timestamp: result.messageTimestamp as number,
      };
    }

    throw new Error('Failed to send message');
  }

  private async applyAntiBanDelays(
    payload: MessagePayload, 
    config: AntiBanConfig
  ): Promise<void> {
    const intervalMs = this.calculateVariableInterval(config.minIntervalMs, config.maxIntervalMs);
    await this.sleep(intervalMs);
  }

  private calculateVariableInterval(min: number, max: number): number {
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6;
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const interval = mean + z0 * stdDev;
    return Math.max(min, Math.min(max, Math.round(interval)));
  }

  private async sendTextMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    return await socket.sendMessage(payload.remoteJid, {
      text: content.text,
      mentions: content.mentions,
    });
  }

  private async sendImageMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    const buffer = await this.getMediaBuffer(content);

    return await socket.sendMessage(payload.remoteJid, {
      image: buffer,
      caption: content.caption,
    });
  }

  private async sendVideoMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    const buffer = await this.getMediaBuffer(content);

    return await socket.sendMessage(payload.remoteJid, {
      video: buffer,
      caption: content.caption,
    });
  }

  private async sendAudioMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    const buffer = await this.getMediaBuffer(content);

    return await socket.sendMessage(payload.remoteJid, {
      audio: buffer,
      ptt: content.ptt ?? true,
    });
  }

  private async sendDocumentMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    const buffer = await this.getMediaBuffer(content);

    return await socket.sendMessage(payload.remoteJid, {
      document: buffer,
      fileName: content.fileName || 'document.pdf',
    });
  }

  private async sendLocationMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    return await socket.sendMessage(payload.remoteJid, {
      location: {
        degreesLatitude: content.degreesLatitude,
        degreesLongitude: content.degreesLongitude,
        name: content.name,
        address: content.address,
      },
    });
  }

  private async sendContactMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    return await socket.sendMessage(payload.remoteJid, {
      contacts: {
        displayName: content.displayName,
        contacts: [{ vcard: content.vcard }],
      },
    });
  }

  private async getMediaBuffer(content: any): Promise<Buffer> {
    if (content.buffer) return content.buffer;
    if (content.base64) return Buffer.from(content.base64, 'base64');
    if (content.url) {
      const response = await axios.get(content.url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    }
    throw new Error('No media source provided');
  }

  // ============================================
  // GROUP MANAGEMENT
  // ============================================

  async getGroupInfo(sessionId: string, groupJid: string): Promise<GroupInfo> {
    const socket = this.getSocket(sessionId);
    const metadata = await socket.groupMetadata(groupJid);
    
    return {
      id: metadata.id || "",
      subject: metadata.subject || "",
      subjectOwner: metadata.subjectOwner,
      subjectTime: metadata.subjectTime,
      desc: metadata.desc,
      descOwner: metadata.descOwner,
      descTime: metadata.descTime,
      owner: metadata.owner,
      creation: metadata.creation,
      participants: metadata.participants as any[],
      ephemeralDuration: metadata.ephemeralDuration,
      inviteCode: metadata.inviteCode || "",
    } as GroupInfo;
  }

  async updateGroupSubject(sessionId: string, groupJid: string, subject: string): Promise<void> {
    const socket = this.getSocket(sessionId);
    await socket.groupUpdateSubject(groupJid, subject);
  }

  async getGroupInviteInfo(sessionId: string, inviteCode: string): Promise<any> {
    const socket = this.getSocket(sessionId);
    return await socket.groupGetInviteInfo(inviteCode);
  }

  async acceptGroupInvite(sessionId: string, inviteCode: string): Promise<string> {
    const socket = this.getSocket(sessionId);
    const result = await socket.groupAcceptInvite(inviteCode);
    return result || "";
  }

  // ============================================
  // PRESENCE & CHAT OPERATIONS
  // ============================================

  async setPresence(
    sessionId: string, 
    presence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused',
    remoteJid?: string
  ): Promise<void> {
    const socket = this.getSocket(sessionId);
    if (remoteJid) {
      await socket.sendPresenceUpdate(presence, remoteJid);
    } else {
      await socket.sendPresenceUpdate(presence);
    }
  }

  async markChatAsRead(sessionId: string, remoteJid: string): Promise<void> {
    const socket = this.getSocket(sessionId);
    await socket.readMessages([{ remoteJid, id: '' }]);
  }

  async getChats(sessionId: string): Promise<ChatSummary[]> {
    const socket = this.getSocket(sessionId);
    const chats = await socket.groupFetchAllParticipating();
    
    return Object.values(chats).map((chat: any) => ({
      id: chat.id,
      name: chat.subject,
      remoteJid: chat.id,
      unreadCount: 0,
      lastMessage: undefined,
      isGroup: true,
      profilePicUrl: undefined,
    })) as any;
  }

  // ============================================
  // HUMAN WAKE-UP CYCLE
  // ============================================

  private startHumanWakeUpCycle(sessionId: string): void {
    const config = this.sessionConfigs.get(sessionId);
    if (!config?.markOnlineOnConnect) return;

    const scheduleAction = () => {
      const now = new Date();
      const hour = now.getHours();
      const isBusinessHours = hour >= 9 && hour < 18;
      
      if (!isBusinessHours) {
        const nextMorning = new Date(now);
        nextMorning.setHours(9, 0, 0, 0);
        if (nextMorning <= now) nextMorning.setDate(nextMorning.getDate() + 1);
        
        setTimeout(scheduleAction, nextMorning.getTime() - now.getTime());
        return;
      }

      this.performWakeUpAction(sessionId);
      setTimeout(scheduleAction, (15 + Math.random() * 30) * 60 * 1000);
    };

    setTimeout(scheduleAction, 5 * 60 * 1000);
  }

  private async performWakeUpAction(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) return;

    const actions = [
      () => session.socket!.sendPresenceUpdate('available'),
      () => session.socket!.sendPresenceUpdate('unavailable'),
    ];

    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    
    try {
      await randomAction();
    } catch (error) {
      this.logger.warn({ sessionId, error }, 'Wake-up action failed');
    }
  }

  // ============================================
  // SESSION PERSISTENCE
  // ============================================

  private async persistSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const data = {
      id: session.id,
      name: session.name,
      status: session.status,
      phoneNumber: session.phoneNumber,
      pushName: session.pushName,
      metrics: session.metrics,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastActivityAt: session.lastActivityAt,
    };

    await this.redis.setex(`session:${sessionId}`, 86400, JSON.stringify(data));
  }

  private async restoreSessions(): Promise<void> {
    try {
      const { readdir } = await import('fs/promises');
      const entries = await readdir(this.sessionsPath, { withFileTypes: true });
      const sessionDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

      for (const sessionId of sessionDirs) {
        const credsPath = join(this.sessionsPath, sessionId, 'creds.json');
        if (existsSync(credsPath)) {
          this.logger.info({ sessionId }, 'Restoring session from disk');
          
          const sessionState: SessionState = {
            id: sessionId,
            name: sessionId,
            status: 'DISCONNECTED',
            createdAt: new Date(),
            updatedAt: new Date(),
            metrics: { messagesSent: 0, messagesReceived: 0, messagesFailed: 0, bytesUploaded: 0, bytesDownloaded: 0, connectionUptimeMs: 0, reconnections: 0 },
          };

          this.sessions.set(sessionId, sessionState);
          this.sessionConfigs.set(sessionId, {
            name: sessionId, syncFullHistory: false, markOnlineOnConnect: true, keepAliveIntervalMs: 30000, browserName: 'FacilZap API', waWebVersion: '2.3000.1015901307',
          });

          this.initializeSocket(sessionId);
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to restore sessions');
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.socket) {
      try { await session.socket.logout(); } catch {}
    }
    this.sessions.delete(sessionId);
    this.sessionConfigs.delete(sessionId);
    await this.redis.del(`session:${sessionId}`);

    const sessionPath = join(this.sessionsPath, sessionId);
    try {
      const { rm } = await import('fs/promises');
      await rm(sessionPath, { recursive: true, force: true });
    } catch {}
    this.logger.info({ sessionId }, 'Session deleted');
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  private getSocket(sessionId: string): WASocket {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) throw new Error(`Socket not available for session: ${sessionId}`);
    return session.socket;
  }

  // ============================================
  // UTILITIES
  // ============================================

  private extractMessageText(message: proto.IWebMessageInfo): string {
    const msg = message.message;
    if (!msg) return '';
    return (msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || msg.documentMessage?.caption || '');
  }

  private getMessageType(message: proto.IWebMessageInfo): string {
    const msg = message.message;
    if (!msg) return 'unknown';
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.videoMessage) return 'video';
    if (msg.audioMessage) return 'audio';
    if (msg.documentMessage) return 'document';
    if (msg.locationMessage) return 'location';
    if (msg.contactMessage || msg.contactsArrayMessage) return 'contact';
    if (msg.stickerMessage) return 'sticker';
    return 'unknown';
  }

  private async sendWebhook(event: WebhookEvent): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      await axios.post(this.webhookUrl, event, { timeout: 5000, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      this.logger.warn({ error, event: event.event }, 'Webhook delivery failed');
    }
  }

  public sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

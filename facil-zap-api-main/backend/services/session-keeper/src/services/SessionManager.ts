// @ts-nocheck
// ============================================
// SESSION MANAGER - The Session Keeper
// Implementação do Noise Protocol Framework
// Gerenciamento Multi-Device Persistente
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
import { exec } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import sharp from 'sharp';
import NodeCache from 'node-cache';
import { Logger } from 'pino';

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

const execAsync = promisify(exec);

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private sessionConfigs: Map<string, SessionConfig> = new Map();
  private messageCache: NodeCache;
  private logger: Logger;
  private redis: any; // Redis client
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
    
    // Cache para evitar duplicação de mensagens (5 min TTL)
    this.messageCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    
    // Inicializar sessões persistidas
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

    // Event handlers
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

    socket.ev.on('messages.upsert', (m) => 
      this.handleMessagesUpsert(sessionId, m)
    );

    socket.ev.on('messages.update', (updates: any[]) => 
      this.handleMessagesUpdate(sessionId, updates)
    );

    socket.ev.on('presence.update', (update: any) => 
      this.handlePresenceUpdate(sessionId, update)
    );

    socket.ev.on('groups.upsert', (groups) => {
      this.emit('groups.upsert', { sessionId, groups });
    });

    socket.ev.on('groups.update', (updates) => {
      this.emit('groups.update', { sessionId, updates });
    });

    socket.ev.on('group-participants.update', (update) => {
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
      (session as any).disconnectedAt = new Date();
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
      (session as any).connectedAt = new Date();
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

      this.logger.debug({ sessionId, msgId, from: remoteJid }, 'Message received');

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
  // MESSAGE SENDING (with Anti-Ban Integration)
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
    const socket = this.sessions.get(payload.remoteJid.split('@')[0])?.socket;
    if (!socket) return;

    const intervalMs = this.calculateVariableInterval(config.minIntervalMs, config.maxIntervalMs);
    await this.sleep(intervalMs);

    if (config.typingSimulation && payload.type === 'text') {
      const textLength = (payload.content as any).text?.length || 0;
      const typingDuration = this.calculateTypingDuration(textLength);
      
      await socket.sendPresenceUpdate('composing', payload.remoteJid);
      await this.sleep(typingDuration);
      await socket.sendPresenceUpdate('paused', payload.remoteJid);
    }
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

  private calculateTypingDuration(textLength: number): number {
    const charsPerSecond = 4;
    const baseTime = (textLength / charsPerSecond) * 1000;
    const variation = baseTime * 0.2 * (Math.random() * 2 - 1);
    return Math.max(1000, Math.min(10000, baseTime + variation));
  }

  private async sendTextMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    return await socket.sendMessage(payload.remoteJid, {
      text: content.text,
      mentions: content.mentions,
      contextInfo: content.contextInfo,
    });
  }

  private async sendImageMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    const buffer = await this.getMediaBuffer(content);
    const optimizedBuffer = await this.optimizeImage(buffer);

    return await socket.sendMessage(payload.remoteJid, {
      image: optimizedBuffer,
      caption: content.caption,
      mimetype: content.mimetype || 'image/jpeg',
      contextInfo: content.contextInfo,
    });
  }

  private async sendVideoMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    let buffer = await this.getMediaBuffer(content);
    buffer = await this.convertVideo(buffer);

    return await socket.sendMessage(payload.remoteJid, {
      video: buffer,
      caption: content.caption,
      mimetype: content.mimetype || 'video/mp4',
      gifPlayback: content.gifPlayback,
      contextInfo: content.contextInfo,
    });
  }

  private async sendAudioMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    let buffer = await this.getMediaBuffer(content);
    buffer = await this.convertAudio(buffer);

    return await socket.sendMessage(payload.remoteJid, {
      audio: buffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: content.ptt ?? true,
      contextInfo: content.contextInfo,
    });
  }

  private async sendDocumentMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    const buffer = await this.getMediaBuffer(content);

    return await socket.sendMessage(payload.remoteJid, {
      document: buffer,
      mimetype: content.mimetype || 'application/pdf',
      fileName: content.fileName || 'document.pdf',
      contextInfo: content.contextInfo,
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
      contextInfo: content.contextInfo,
    });
  }

  private async sendContactMessage(socket: WASocket, payload: MessagePayload): Promise<proto.WebMessageInfo | undefined> {
    const content = payload.content as any;
    return await socket.sendMessage(payload.remoteJid, {
      contacts: {
        displayName: content.displayName,
        contacts: [{ vcard: content.vcard }],
      },
      contextInfo: content.contextInfo,
    });
  }

  // ============================================
  // MEDIA PROCESSING
  // ============================================

  private async getMediaBuffer(content: any): Promise<Buffer> {
    if (content.buffer) return content.buffer;
    if (content.base64) return Buffer.from(content.base64, 'base64');
    if (content.url) {
      const response = await axios.get(content.url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    }
    throw new Error('No media source provided');
  }

  private async optimizeImage(buffer: Buffer): Promise<Buffer> {
    const maxSize = 5 * 1024 * 1024;
    if (buffer.length <= maxSize) return buffer;

    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    if (metadata.format === 'jpeg') return await image.jpeg({ quality: 80, progressive: true }).toBuffer();
    if (metadata.format === 'png') return await image.png({ compressionLevel: 9 }).toBuffer();

    if (buffer.length > maxSize) {
      return await image.resize(1920, 1080, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
    }
    return buffer;
  }

  private async convertVideo(buffer: Buffer): Promise<Buffer> {
    const inputPath = `/tmp/video_input_${Date.now()}.tmp`;
    const outputPath = `/tmp/video_output_${Date.now()}.mp4`;

    try {
      await writeFile(inputPath, buffer);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .toFormat('mp4')
          .videoCodec('libx264')
          .audioCodec('aac')
          .size('1280x720')
          .videoBitrate('1000k')
          .audioBitrate('128k')
          .outputOptions(['-movflags faststart', '-pix_fmt yuv420p', '-profile:v baseline', '-level 3.0'])
          .on('end', (() => resolve()) as any)
          .on('error', ((err: any) => reject(err)) as any)
          .save(outputPath);
      });

      return await readFile(outputPath);
    } finally {
      try { await unlink(inputPath); await unlink(outputPath); } catch {}
    }
  }

  private async convertAudio(buffer: Buffer): Promise<Buffer> {
    const inputPath = `/tmp/audio_input_${Date.now()}.tmp`;
    const outputPath = `/tmp/audio_output_${Date.now()}.opus`;

    try {
      await writeFile(inputPath, buffer);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .toFormat('opus')
          .audioCodec('libopus')
          .audioBitrate('24k')
          .audioChannels(1)
          .audioFrequency(24000)
          .on('end', (() => resolve()) as any)
          .on('error', ((err: any) => reject(err)) as any)
          .save(outputPath);
      });

      return await readFile(outputPath);
    } finally {
      try { await unlink(inputPath); await unlink(outputPath); } catch {}
    }
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

  async updateGroupDescription(sessionId: string, groupJid: string, description: string): Promise<void> {
    const socket = this.getSocket(sessionId);
    await socket.groupUpdateDescription(groupJid, description);
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

  async archiveChat(sessionId: string, remoteJid: string, archive: boolean = true): Promise<void> {
    const socket = this.getSocket(sessionId);
    await socket.chatModify({ archive, lastMessages: [{ key: { remoteJid, id: '' } }] } as any, remoteJid);
  }

  async pinChat(sessionId: string, remoteJid: string, pin: boolean = true): Promise<void> {
    const socket = this.getSocket(sessionId);
    await socket.chatModify({ pin } as any, remoteJid);
  }

  async getChats(sessionId: string): Promise<ChatSummary[]> {
    const socket = this.getSocket(sessionId);
    const chats = await socket.groupFetchAllParticipating();
    
    return Object.values(chats).map(chat => ({
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
  // HUMAN WAKE-UP CYCLE (REAL IMPLEMENTATION)
  // ============================================

  async simulateStatusView(sessionId: string): Promise<void> {
    try {
      const socket = this.getSocket(sessionId);
      await socket.sendPresenceUpdate('available');
      await this.sleep(2000 + Math.random() * 3000);
      
      if (typeof (socket as any).fetchStatusPrivacy === 'function') {
         await (socket as any).fetchStatusPrivacy();
      }
      
      this.logger.info({ sessionId }, 'Real status view behavior simulated');
    } catch (error) {
      this.logger.warn({ sessionId, error }, 'Failed to simulate status view');
    }
  }

  async simulateReadReceipt(sessionId: string): Promise<void> {
    try {
      const socket = this.getSocket(sessionId);
      const chats = await socket.groupFetchAllParticipating();
      const chatIds = Object.keys(chats);
      
      if (chatIds.length === 0) return;
      const randomChat = chatIds[Math.floor(Math.random() * chatIds.length)];
      
      await socket.readMessages([{ remoteJid: randomChat, id: '' }]);
      this.logger.info({ sessionId, remoteJid: randomChat }, 'Random read receipt sent');
    } catch (error) {
      this.logger.warn({ sessionId, error }, 'Failed to simulate read receipt');
    }
  }

  async updateProfileStatus(sessionId: string): Promise<void> {
    try {
      const socket = this.getSocket(sessionId);
      const messages = ["Disponível", "Ocupado", "Na reunião", "Só mensagens urgente", "Atendendo clientes", "Online", "Sleeping"];
      const randomStatus = messages[Math.floor(Math.random() * messages.length)];
      
      await socket.updateProfileStatus(randomStatus);
      this.logger.info({ sessionId, status: randomStatus }, 'Profile status (About) updated');
    } catch (error) {
        this.logger.warn({ sessionId, error }, 'Failed to update profile status');
    }
  }

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
      () => this.updateProfileStatus(sessionId),
      () => this.simulateStatusView(sessionId),
      () => this.simulateReadReceipt(sessionId)
    ];

    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    
    try {
      await randomAction();
      this.logger.debug({ sessionId }, 'Wake-up action performed');
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
// ============================================
// SESSION CONTROLLER
// REST API endpoints for session management
// ============================================

import { Request, Response } from 'express';
import { SessionManager } from '../services/SessionManager';
import { createLogger } from '../utils/logger';
import { MessagePayload, AntiBanConfig } from '../types';

const logger = createLogger('SessionController');

export class SessionController {
  constructor(private sessionManager: SessionManager) {
    // Setup event listeners for webhooks
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.sessionManager.on('qr', ({ sessionId, qr }) => {
      logger.info({ sessionId }, 'QR Code generated');
    });

    this.sessionManager.on('ready', ({ sessionId, phoneNumber }) => {
      logger.info({ sessionId, phoneNumber }, 'Session ready');
    });

    this.sessionManager.on('message', ({ sessionId, message }) => {
      logger.debug({ sessionId, msgId: message.key.id }, 'Message received');
    });
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  createSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, syncFullHistory = false } = req.body;
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const session = await this.sessionManager.createSession(sessionId, {
        name,
        syncFullHistory,
      });

      res.status(201).json({
        success: true,
        data: {
          id: session.id,
          name: session.name,
          status: session.status,
          qrCode: session.qrCode,
          createdAt: session.createdAt,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create session');
      res.status(500).json({
        success: false,
        error: 'Failed to create session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  getSessions = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessions = this.sessionManager.getAllSessions().map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        phoneNumber: s.phoneNumber,
        pushName: s.pushName,
        metrics: s.metrics,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
      }));

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get sessions');
      res.status(500).json({
        success: false,
        error: 'Failed to get sessions',
      });
    }
  };

  getSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const session = this.sessionManager.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: session.id,
          name: session.name,
          status: session.status,
          phoneNumber: session.phoneNumber,
          pushName: session.pushName,
          qrCode: session.status === 'QR_READY' ? session.qrCode : undefined,
          metrics: session.metrics,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          lastActivityAt: session.lastActivityAt,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get session');
      res.status(500).json({
        success: false,
        error: 'Failed to get session',
      });
    }
  };

  deleteSession = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      await this.sessionManager.deleteSession(sessionId);

      res.json({
        success: true,
        message: 'Session deleted successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete session');
      res.status(500).json({
        success: false,
        error: 'Failed to delete session',
      });
    }
  };

  // ============================================
  // MESSAGING
  // ============================================

  sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const payload: MessagePayload = req.body;
      const antiBanConfig: AntiBanConfig = req.body.antiBan || {
        enabled: true,
        minIntervalMs: 1500,
        maxIntervalMs: 4500,
        typingSimulation: true,
        humanWakeUp: true,
      };

      const result = await this.sessionManager.sendMessage(
        sessionId,
        payload,
        antiBanConfig
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send message');
      res.status(500).json({
        success: false,
        error: 'Failed to send message',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  sendBulkMessages = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { messages, antiBan }: { messages: MessagePayload[]; antiBan?: AntiBanConfig } = req.body;

      const results = [];
      const errors = [];

      for (let i = 0; i < messages.length; i++) {
        try {
          const result = await this.sessionManager.sendMessage(
            sessionId,
            messages[i],
            antiBan
          );
          results.push({ index: i, ...result });
        } catch (error) {
          errors.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        data: {
          total: messages.length,
          sent: results.length,
          failed: errors.length,
          results,
          errors,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send bulk messages');
      res.status(500).json({
        success: false,
        error: 'Failed to send bulk messages',
      });
    }
  };

  // ============================================
  // HUMAN SIMULATION ACTIONS (Called by Anti-Ban)
  // ============================================

  simulateStatusView = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      await this.sessionManager.simulateStatusView(sessionId);
      res.json({ success: true, message: 'Status view simulated' });
    } catch (error) {
      logger.error({ error, sessionId: req.params.sessionId }, 'Failed to simulate status view');
      res.status(500).json({ success: false, error: 'Failed to simulate status view' });
    }
  };

  simulateProfileUpdate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      await this.sessionManager.updateProfileStatus(sessionId);
      res.json({ success: true, message: 'Profile status updated' });
    } catch (error) {
      logger.error({ error, sessionId: req.params.sessionId }, 'Failed to simulate profile update');
      res.status(500).json({ success: false, error: 'Failed to simulate profile update' });
    }
  };

  simulateReadReceipt = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      await this.sessionManager.simulateReadReceipt(sessionId);
      res.json({ success: true, message: 'Random read receipt simulated' });
    } catch (error) {
      logger.error({ error, sessionId: req.params.sessionId }, 'Failed to simulate read receipt');
      res.status(500).json({ success: false, error: 'Failed to simulate read receipt' });
    }
  };

  // ============================================
  // GROUP OPERATIONS
  // ============================================

  getGroupInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, groupJid } = req.params;
      const info = await this.sessionManager.getGroupInfo(sessionId, groupJid);

      res.json({
        success: true,
        data: info,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get group info');
      res.status(500).json({
        success: false,
        error: 'Failed to get group info',
      });
    }
  };

  updateGroupSubject = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, groupJid } = req.params;
      const { subject } = req.body;

      await this.sessionManager.updateGroupSubject(sessionId, groupJid, subject);

      res.json({
        success: true,
        message: 'Group subject updated',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update group subject');
      res.status(500).json({
        success: false,
        error: 'Failed to update group subject',
      });
    }
  };

  getGroupInviteInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { inviteCode } = req.query;

      if (!inviteCode || typeof inviteCode !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Invite code is required',
        });
        return;
      }

      const info = await this.sessionManager.getGroupInviteInfo(sessionId, inviteCode);

      res.json({
        success: true,
        data: info,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get invite info');
      res.status(500).json({
        success: false,
        error: 'Failed to get invite info',
      });
    }
  };

  acceptGroupInvite = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { inviteCode } = req.body;

      const groupJid = await this.sessionManager.acceptGroupInvite(sessionId, inviteCode);

      res.json({
        success: true,
        data: { groupJid },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to accept group invite');
      res.status(500).json({
        success: false,
        error: 'Failed to accept group invite',
      });
    }
  };

  // ============================================
  // PRESENCE & CHAT
  // ============================================

  setPresence = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { presence, remoteJid } = req.body;

      await this.sessionManager.setPresence(sessionId, presence, remoteJid);

      res.json({
        success: true,
        message: 'Presence updated',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to set presence');
      res.status(500).json({
        success: false,
        error: 'Failed to set presence',
      });
    }
  };

  markChatAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { remoteJid } = req.body;

      await this.sessionManager.markChatAsRead(sessionId, remoteJid);

      res.json({
        success: true,
        message: 'Chat marked as read',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to mark chat as read');
      res.status(500).json({
        success: false,
        error: 'Failed to mark chat as read',
      });
    }
  };

  getChats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const chats = await this.sessionManager.getChats(sessionId);

      res.json({
        success: true,
        data: chats,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get chats');
      res.status(500).json({
        success: false,
        error: 'Failed to get chats',
      });
    }
  };
}
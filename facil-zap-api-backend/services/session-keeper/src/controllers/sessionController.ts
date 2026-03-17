// ============================================
// SESSION CONTROLLER
// ============================================

import { Request, Response } from 'express';
import { SessionManager } from '../services/SessionManager';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionController');

export class SessionController {
  constructor(private sessionManager: SessionManager) {}

  // POST /sessions
  createSession = async (req: Request, res: Response) => {
    try {
      const { name, config } = req.body;
      const sessionId = name || `session-${Date.now()}`;
      
      const session = await this.sessionManager.createSession(sessionId, config);
      
      res.status(201).json({
        success: true,
        data: {
          id: session.id,
          name: session.name,
          status: session.status,
          createdAt: session.createdAt,
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to create session');
      res.status(500).json({
        success: false,
        error: 'Failed to create session',
        message: error.message,
      });
    }
  };

  // GET /sessions
  getSessions = async (req: Request, res: Response) => {
    try {
      const sessions = this.sessionManager.getAllSessions().map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        phoneNumber: s.phoneNumber,
        pushName: s.pushName,
        qrCode: s.qrCode,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        metrics: s.metrics,
      }));

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get sessions');
      res.status(500).json({
        success: false,
        error: 'Failed to get sessions',
      });
    }
  };

  // GET /sessions/:sessionId
  getSession = async (req: Request, res: Response) => {
    try {
      const session = this.sessionManager.getSession(req.params.sessionId);
      
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
          qrCode: session.qrCode,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          metrics: session.metrics,
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get session');
      res.status(500).json({
        success: false,
        error: 'Failed to get session',
      });
    }
  };

  // DELETE /sessions/:sessionId
  deleteSession = async (req: Request, res: Response) => {
    try {
      await this.sessionManager.deleteSession(req.params.sessionId);
      
      res.json({
        success: true,
        message: 'Session deleted',
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to delete session');
      res.status(500).json({
        success: false,
        error: 'Failed to delete session',
      });
    }
  };

  // POST /sessions/:sessionId/messages
  sendMessage = async (req: Request, res: Response) => {
    try {
      const { remoteJid, type, content, antiBanConfig } = req.body;
      
      const result = await this.sessionManager.sendMessage(
        req.params.sessionId,
        { remoteJid, type, content },
        antiBanConfig
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to send message');
      res.status(500).json({
        success: false,
        error: 'Failed to send message',
        message: error.message,
      });
    }
  };

  // POST /sessions/:sessionId/messages/bulk
  sendBulkMessages = async (req: Request, res: Response) => {
    try {
      const { messages, antiBanConfig } = req.body;
      const results = [];

      for (const message of messages) {
        try {
          const result = await this.sessionManager.sendMessage(
            req.params.sessionId,
            message,
            antiBanConfig
          );
          results.push({ success: true, data: result });
        } catch (error: any) {
          results.push({ success: false, error: error.message });
        }
      }

      res.json({
        success: true,
        data: results,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to send bulk messages');
      res.status(500).json({
        success: false,
        error: 'Failed to send bulk messages',
      });
    }
  };

  // GET /sessions/:sessionId/groups/:groupJid
  getGroupInfo = async (req: Request, res: Response) => {
    try {
      const groupInfo = await this.sessionManager.getGroupInfo(
        req.params.sessionId,
        req.params.groupJid
      );

      res.json({
        success: true,
        data: groupInfo,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get group info');
      res.status(500).json({
        success: false,
        error: 'Failed to get group info',
      });
    }
  };

  // PATCH /sessions/:sessionId/groups/:groupJid/subject
  updateGroupSubject = async (req: Request, res: Response) => {
    try {
      await this.sessionManager.updateGroupSubject(
        req.params.sessionId,
        req.params.groupJid,
        req.body.subject
      );

      res.json({
        success: true,
        message: 'Group subject updated',
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to update group subject');
      res.status(500).json({
        success: false,
        error: 'Failed to update group subject',
      });
    }
  };

  // GET /sessions/:sessionId/groups/invite/info
  getGroupInviteInfo = async (req: Request, res: Response) => {
    try {
      const { inviteCode } = req.query;
      const info = await this.sessionManager.getGroupInviteInfo(
        req.params.sessionId,
        inviteCode as string
      );

      res.json({
        success: true,
        data: info,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get group invite info');
      res.status(500).json({
        success: false,
        error: 'Failed to get group invite info',
      });
    }
  };

  // POST /sessions/:sessionId/groups/invite/accept
  acceptGroupInvite = async (req: Request, res: Response) => {
    try {
      const { inviteCode } = req.body;
      const result = await this.sessionManager.acceptGroupInvite(
        req.params.sessionId,
        inviteCode
      );

      res.json({
        success: true,
        data: { groupId: result },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to accept group invite');
      res.status(500).json({
        success: false,
        error: 'Failed to accept group invite',
      });
    }
  };

  // POST /sessions/:sessionId/presence
  setPresence = async (req: Request, res: Response) => {
    try {
      const { presence, remoteJid } = req.body;
      await this.sessionManager.setPresence(
        req.params.sessionId,
        presence,
        remoteJid
      );

      res.json({
        success: true,
        message: 'Presence updated',
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to set presence');
      res.status(500).json({
        success: false,
        error: 'Failed to set presence',
      });
    }
  };

  // POST /sessions/:sessionId/chats/read
  markChatAsRead = async (req: Request, res: Response) => {
    try {
      const { remoteJid } = req.body;
      await this.sessionManager.markChatAsRead(req.params.sessionId, remoteJid);

      res.json({
        success: true,
        message: 'Chat marked as read',
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to mark chat as read');
      res.status(500).json({
        success: false,
        error: 'Failed to mark chat as read',
      });
    }
  };

  // GET /sessions/:sessionId/chats
  getChats = async (req: Request, res: Response) => {
    try {
      const chats = await this.sessionManager.getChats(req.params.sessionId);

      res.json({
        success: true,
        data: chats,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get chats');
      res.status(500).json({
        success: false,
        error: 'Failed to get chats',
      });
    }
  };
}

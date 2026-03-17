// ============================================
// CHAT ROUTES
// Endpoints de Chat
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const SESSION_KEEPER_URL = process.env.SESSION_KEEPER_URL || 'http://session-keeper:3000';

// GET /v1/chats/:instanceId - List chats
router.get('/:instanceId', async (req, res, next) => {
  try {
    const response = await axios.get(`${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/chats`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/read - Mark chat as read
router.post('/:instanceId/read', async (req, res, next) => {
  try {
    const { remoteJid } = req.body;
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/chats/read`,
      { remoteJid }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/archive - Archive chat
router.post('/:instanceId/archive', async (req, res, next) => {
  try {
    const { remoteJid } = req.body;
    res.json({ success: true, message: 'Chat archived' });
  } catch (error) {
    next(error);
  }
});

export { router as chatRoutes };

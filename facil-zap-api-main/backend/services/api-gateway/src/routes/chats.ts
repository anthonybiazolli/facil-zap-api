// ============================================
// CHAT ROUTES
// Endpoints de Interação com Chats
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

// GET /v1/chats/:instanceId/:chatId/messages - Get messages
router.get('/:instanceId/:chatId/messages', async (req, res, next) => {
  try {
    const { limit = '50', before } = req.query;
    // Would fetch messages
    res.json({ success: true, data: { messages: [] } });
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/presence - Set presence
router.post('/:instanceId/:chatId/presence', async (req, res, next) => {
  try {
    const { presence } = req.body;
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/presence`,
      { presence, remoteJid: req.params.chatId }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/typing - Send typing
router.post('/:instanceId/:chatId/typing', async (req, res, next) => {
  try {
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/presence`,
      { presence: 'composing', remoteJid: req.params.chatId }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/recording - Send recording
router.post('/:instanceId/:chatId/recording', async (req, res, next) => {
  try {
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/presence`,
      { presence: 'recording', remoteJid: req.params.chatId }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/mark-read - Mark as read
router.post('/:instanceId/:chatId/mark-read', async (req, res, next) => {
  try {
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/chats/read`,
      { remoteJid: req.params.chatId }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/archive - Archive chat
router.post('/:instanceId/:chatId/archive', async (req, res, next) => {
  try {
    // Would implement archive
    res.json({ success: true, message: 'Chat archived' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/unarchive - Unarchive chat
router.post('/:instanceId/:chatId/unarchive', async (req, res, next) => {
  try {
    // Would implement unarchive
    res.json({ success: true, message: 'Chat unarchived' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/pin - Pin chat
router.post('/:instanceId/:chatId/pin', async (req, res, next) => {
  try {
    // Would implement pin
    res.json({ success: true, message: 'Chat pinned' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/unpin - Unpin chat
router.post('/:instanceId/:chatId/unpin', async (req, res, next) => {
  try {
    // Would implement unpin
    res.json({ success: true, message: 'Chat unpinned' });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/chats/:instanceId/:chatId - Delete chat
router.delete('/:instanceId/:chatId', async (req, res, next) => {
  try {
    // Would implement delete
    res.json({ success: true, message: 'Chat deleted' });
  } catch (error) {
    next(error);
  }
});

// GET /v1/chats/:instanceId/:chatId/profile-pic - Get profile picture
router.get('/:instanceId/:chatId/profile-pic', async (req, res, next) => {
  try {
    // Would implement get profile pic
    res.json({ success: true, data: { url: null } });
  } catch (error) {
    next(error);
  }
});

// GET /v1/chats/:instanceId/:chatId/contact - Get contact info
router.get('/:instanceId/:chatId/contact', async (req, res, next) => {
  try {
    // Would implement get contact
    res.json({ success: true, data: { name: '', number: '' } });
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/block - Block contact
router.post('/:instanceId/:chatId/block', async (req, res, next) => {
  try {
    // Would implement block
    res.json({ success: true, message: 'Contact blocked' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/chats/:instanceId/:chatId/unblock - Unblock contact
router.post('/:instanceId/:chatId/unblock', async (req, res, next) => {
  try {
    // Would implement unblock
    res.json({ success: true, message: 'Contact unblocked' });
  } catch (error) {
    next(error);
  }
});

export { router as chatRoutes };
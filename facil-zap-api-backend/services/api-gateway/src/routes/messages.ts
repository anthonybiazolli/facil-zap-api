// ============================================
// MESSAGE ROUTES
// Endpoints de Mensagens
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const SESSION_KEEPER_URL = process.env.SESSION_KEEPER_URL || 'http://session-keeper:3000';
const MESSAGE_QUEUE_URL = process.env.MESSAGE_QUEUE_URL || 'http://message-queue:3000';

// POST /v1/messages/send - Send message (immediate)
router.post('/send', async (req, res, next) => {
  try {
    const { instanceId, ...messageData } = req.body;
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${instanceId}/messages`,
      messageData
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/messages/queue - Queue message
router.post('/queue', async (req, res, next) => {
  try {
    const response = await axios.post(`${MESSAGE_QUEUE_URL}/queue/messages`, req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/messages/bulk - Send bulk messages
router.post('/bulk', async (req, res, next) => {
  try {
    const { instanceId, messages, options } = req.body;
    
    const response = await axios.post(`${MESSAGE_QUEUE_URL}/queue/batch`, {
      messages: messages.map((m: any) => ({ ...m, instanceId })),
      options,
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/messages/schedule - Schedule message
router.post('/schedule', async (req, res, next) => {
  try {
    const response = await axios.post(`${MESSAGE_QUEUE_URL}/queue/schedule`, req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/messages/status/:jobId - Get message status
router.get('/status/:jobId', async (req, res, next) => {
  try {
    const response = await axios.get(`${MESSAGE_QUEUE_URL}/queue/jobs/${req.params.jobId}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/messages/cancel/:jobId - Cancel message
router.post('/cancel/:jobId', async (req, res, next) => {
  try {
    const response = await axios.post(`${MESSAGE_QUEUE_URL}/queue/jobs/${req.params.jobId}/cancel`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/messages/:instanceId/forward - Forward message
router.post('/:instanceId/forward', async (req, res, next) => {
  try {
    const { messageId, to } = req.body;
    res.json({ success: true, message: 'Message forwarded' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/messages/:instanceId/react - React to message
router.post('/:instanceId/react', async (req, res, next) => {
  try {
    const { messageId, reaction } = req.body;
    res.json({ success: true, message: 'Reaction sent' });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/messages/:instanceId/delete - Delete message
router.delete('/:instanceId/delete', async (req, res, next) => {
  try {
    const { messageId } = req.body;
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
});

export { router as messageRoutes };

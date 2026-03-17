// ============================================
// GROUP ROUTES
// Endpoints de Grupos
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const SESSION_KEEPER_URL = process.env.SESSION_KEEPER_URL || 'http://session-keeper:3000';

// GET /v1/groups/:instanceId - List groups
router.get('/:instanceId', async (req, res, next) => {
  try {
    const response = await axios.get(`${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/chats`);
    const groups = response.data.data?.filter((chat: any) => chat.isGroup) || [];
    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
});

// GET /v1/groups/:instanceId/:groupJid - Get group info
router.get('/:instanceId/:groupJid', async (req, res, next) => {
  try {
    const { instanceId, groupJid } = req.params;
    const response = await axios.get(`${SESSION_KEEPER_URL}/sessions/${instanceId}/groups/${groupJid}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// PATCH /v1/groups/:instanceId/:groupJid/subject - Update group subject
router.patch('/:instanceId/:groupJid/subject', async (req, res, next) => {
  try {
    const { instanceId, groupJid } = req.params;
    const response = await axios.patch(
      `${SESSION_KEEPER_URL}/sessions/${instanceId}/groups/${groupJid}/subject`,
      req.body
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/invite/accept - Accept group invite
router.post('/:instanceId/invite/accept', async (req, res, next) => {
  try {
    const { instanceId } = req.params;
    const { inviteCode } = req.body;
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${instanceId}/groups/invite/accept`,
      { inviteCode }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

export { router as groupRoutes };

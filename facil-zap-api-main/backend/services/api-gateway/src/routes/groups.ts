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
    const groups = response.data.data?.filter((c: any) => c.isGroup) || [];
    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
});

// GET /v1/groups/:instanceId/:groupJid - Get group info
router.get('/:instanceId/:groupJid', async (req, res, next) => {
  try {
    const response = await axios.get(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/groups/${req.params.groupJid}`
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/create - Create group
router.post('/:instanceId/create', async (req, res, next) => {
  try {
    const { name, participants } = req.body;
    // Would implement create group
    res.json({ success: true, message: 'Group created' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/leave - Leave group
router.post('/:instanceId/:groupJid/leave', async (req, res, next) => {
  try {
    // Would implement leave group
    res.json({ success: true, message: 'Left group' });
  } catch (error) {
    next(error);
  }
});

// GET /v1/groups/:instanceId/invite-info - Get invite info
router.get('/:instanceId/invite-info', async (req, res, next) => {
  try {
    const { inviteCode } = req.query;
    const response = await axios.get(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/groups/invite-info?inviteCode=${inviteCode}`
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/accept-invite - Accept invite
router.post('/:instanceId/accept-invite', async (req, res, next) => {
  try {
    const { inviteCode } = req.body;
    const response = await axios.post(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/groups/invite/accept`,
      { inviteCode }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/subject - Update subject
router.post('/:instanceId/:groupJid/subject', async (req, res, next) => {
  try {
    const { subject } = req.body;
    const response = await axios.patch(
      `${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}/groups/${req.params.groupJid}/subject`,
      { subject }
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/description - Update description
router.post('/:instanceId/:groupJid/description', async (req, res, next) => {
  try {
    const { description } = req.body;
    // Would implement update description
    res.json({ success: true, message: 'Description updated' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/participants/add - Add participants
router.post('/:instanceId/:groupJid/participants/add', async (req, res, next) => {
  try {
    const { participants } = req.body;
    // Would implement add participants
    res.json({ success: true, message: 'Participants added' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/participants/remove - Remove participants
router.post('/:instanceId/:groupJid/participants/remove', async (req, res, next) => {
  try {
    const { participants } = req.body;
    // Would implement remove participants
    res.json({ success: true, message: 'Participants removed' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/participants/promote - Promote participants
router.post('/:instanceId/:groupJid/participants/promote', async (req, res, next) => {
  try {
    const { participants } = req.body;
    // Would implement promote
    res.json({ success: true, message: 'Participants promoted' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/participants/demote - Demote participants
router.post('/:instanceId/:groupJid/participants/demote', async (req, res, next) => {
  try {
    const { participants } = req.body;
    // Would implement demote
    res.json({ success: true, message: 'Participants demoted' });
  } catch (error) {
    next(error);
  }
});

// GET /v1/groups/:instanceId/:groupJid/invite-code - Get invite code
router.get('/:instanceId/:groupJid/invite-code', async (req, res, next) => {
  try {
    // Would implement get invite code
    res.json({ success: true, data: { inviteCode: 'xxx' } });
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/invite-code/revoke - Revoke invite code
router.post('/:instanceId/:groupJid/invite-code/revoke', async (req, res, next) => {
  try {
    // Would implement revoke
    res.json({ success: true, message: 'Invite code revoked' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/groups/:instanceId/:groupJid/settings - Update settings
router.post('/:instanceId/:groupJid/settings', async (req, res, next) => {
  try {
    const { announce, restrict } = req.body;
    // Would implement settings
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    next(error);
  }
});

export { router as groupRoutes };
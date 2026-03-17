// ============================================
// INSTANCE ROUTES
// Endpoints de Gerenciamento de Instâncias
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const SESSION_KEEPER_URL = process.env.SESSION_KEEPER_URL || 'http://session-keeper:3000';
const ANTI_BAN_URL = process.env.ANTI_BAN_URL || 'http://anti-ban-engine:3000';
const MESSAGE_QUEUE_URL = process.env.MESSAGE_QUEUE_URL || 'http://message-queue:3000';

// POST /v1/instances - Create instance
router.post('/', async (req, res, next) => {
  try {
    const response = await axios.post(`${SESSION_KEEPER_URL}/sessions`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/instances - List instances
router.get('/', async (req, res, next) => {
  try {
    const response = await axios.get(`${SESSION_KEEPER_URL}/sessions`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/instances/:instanceId - Get instance
router.get('/:instanceId', async (req, res, next) => {
  try {
    const response = await axios.get(`${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/instances/:instanceId - Delete instance
router.delete('/:instanceId', async (req, res, next) => {
  try {
    const response = await axios.delete(`${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/instances/:instanceId/qr - Get QR code
router.get('/:instanceId/qr', async (req, res, next) => {
  try {
    const response = await axios.get(`${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}`);
    const qrCode = response.data.data?.qrCode;
    if (qrCode) {
      res.json({ success: true, data: { qrCode } });
    } else {
      res.status(404).json({ success: false, error: 'QR code not available' });
    }
  } catch (error) {
    next(error);
  }
});

// GET /v1/instances/:instanceId/metrics - Get instance metrics
// ATUALIZADO: Agregação de dados para Monitoramento Profundo
router.get('/:instanceId/metrics', async (req, res, next) => {
  try {
    const { instanceId } = req.params;

    // Busca paralela para eficiência
    const [sessionResponse, antiBanResponse, queueResponse] = await Promise.allSettled([
        axios.get(`${SESSION_KEEPER_URL}/sessions/${instanceId}`),
        axios.get(`${ANTI_BAN_URL}/risk/${instanceId}`), // Assumindo rota de risco no AntiBan
        axios.get(`${MESSAGE_QUEUE_URL}/queue/${instanceId}/stats`) // Assumindo rota de stats na Fila
    ]);

    // Extrair dados com fallback seguro
    const sessionData = sessionResponse.status === 'fulfilled' ? sessionResponse.value.data.data : null;
    const riskData = antiBanResponse.status === 'fulfilled' ? antiBanResponse.value.data : { score: 0, level: 'UNKNOWN' };
    const queueData = queueResponse.status === 'fulfilled' ? queueResponse.value.data : { waiting: 0, processing: 0 };

    const aggregatedMetrics = {
        instance: {
            status: sessionData?.status || 'UNKNOWN',
            uptime: sessionData?.metrics?.connectionUptimeMs || 0,
            phoneNumber: sessionData?.phoneNumber
        },
        performance: {
            messagesSent: sessionData?.metrics?.messagesSent || 0,
            messagesReceived: sessionData?.metrics?.messagesReceived || 0,
            queueBacklog: queueData.waiting || 0,
            queueProcessing: queueData.processing || 0
        },
        health: {
            riskScore: riskData.score || 0,
            riskLevel: riskData.level || 'LOW',
            factors: riskData.factors || []
        }
    };

    res.json({ success: true, data: aggregatedMetrics });
  } catch (error) {
    next(error);
  }
});

// GET /v1/instances/:instanceId/logs - Get instance logs
router.get('/:instanceId/logs', async (req, res, next) => {
  try {
    // Would fetch from logging service
    res.json({ 
      success: true, 
      data: { 
        logs: [],
        message: 'Logs available via /v1/audit/logs'
      } 
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/instances/:instanceId/restart - Restart instance
router.post('/:instanceId/restart', async (req, res, next) => {
  try {
    // Delete and recreate
    await axios.delete(`${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}`);
    const response = await axios.post(`${SESSION_KEEPER_URL}/sessions`, {
      name: `Restarted-${Date.now()}`,
    });
    res.json({ 
      success: true, 
      message: 'Instance restarted',
      data: response.data.data,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/instances/:instanceId/logout - Logout instance
router.post('/:instanceId/logout', async (req, res, next) => {
  try {
    await axios.delete(`${SESSION_KEEPER_URL}/sessions/${req.params.instanceId}`);
    res.json({ success: true, message: 'Instance logged out' });
  } catch (error) {
    next(error);
  }
});

export { router as instanceRoutes };
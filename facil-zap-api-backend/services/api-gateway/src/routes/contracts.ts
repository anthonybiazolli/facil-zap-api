// ============================================
// CONTRACT ROUTES
// Endpoints de Contratos (Legal Compliance)
// ============================================

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const LEGAL_COMPLIANCE_URL = process.env.LEGAL_COMPLIANCE_URL || 'http://legal-compliance:3000';

// GET /v1/legal/contracts - List contracts
router.get('/contracts', async (req, res, next) => {
  try {
    const response = await axios.get(`${LEGAL_COMPLIANCE_URL}/contracts`, {
      params: req.query,
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/legal/contracts - Create contract
router.post('/contracts', async (req, res, next) => {
  try {
    const response = await axios.post(`${LEGAL_COMPLIANCE_URL}/contracts`, req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/legal/contracts/:contractId - Get contract
router.get('/contracts/:contractId', async (req, res, next) => {
  try {
    const response = await axios.get(`${LEGAL_COMPLIANCE_URL}/contracts/${req.params.contractId}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /v1/legal/contracts/:contractId/sign - Sign contract
router.post('/contracts/:contractId/sign', async (req, res, next) => {
  try {
    const response = await axios.post(
      `${LEGAL_COMPLIANCE_URL}/contracts/${req.params.contractId}/sign`,
      req.body
    );
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /v1/legal/contracts/:contractId/pdf - Get contract PDF
router.get('/contracts/:contractId/pdf', async (req, res, next) => {
  try {
    const response = await axios.get(
      `${LEGAL_COMPLIANCE_URL}/contracts/${req.params.contractId}/pdf`,
      { responseType: 'stream' }
    );
    res.setHeader('Content-Type', 'application/pdf');
    response.data.pipe(res);
  } catch (error) {
    next(error);
  }
});

export { router as contractRoutes };

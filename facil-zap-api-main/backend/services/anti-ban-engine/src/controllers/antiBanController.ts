// ============================================
// ANTI-BAN CONTROLLER
// REST API endpoints for Anti-Ban Engine
// ============================================

import { Request, Response } from 'express';
import { AntiBanEngine } from '../services/AntiBanEngine';
import { createLogger } from '../utils/logger';

const logger = createLogger('AntiBanController');

export class AntiBanController {
  constructor(private antiBanEngine: AntiBanEngine) {}

  // ============================================
  // DELAY CALCULATION
  // ============================================

  calculateDelay = async (req: Request, res: Response): Promise<void> => {
    try {
      const { instanceId, messageType, contentLength, config } = req.body;

      if (!instanceId || !messageType) {
        res.status(400).json({
          success: false,
          error: 'instanceId and messageType are required',
        });
        return;
      }

      const calculation = this.antiBanEngine.calculateDelay({
        instanceId,
        messageType,
        contentLength: contentLength || 0,
        config,
      });

      res.json({
        success: true,
        data: calculation,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to calculate delay');
      res.status(500).json({
        success: false,
        error: 'Failed to calculate delay',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // ============================================
  // TYPING SIMULATION
  // ============================================

  calculateTyping = async (req: Request, res: Response): Promise<void> => {
    try {
      const { text, config } = req.body;

      if (!text || typeof text !== 'string') {
        res.status(400).json({
          success: false,
          error: 'text is required and must be a string',
        });
        return;
      }

      // Importar o método do engine
      const simulation = (this.antiBanEngine as any).calculateTypingSimulation(text, config);

      res.json({
        success: true,
        data: simulation,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to calculate typing simulation');
      res.status(500).json({
        success: false,
        error: 'Failed to calculate typing simulation',
      });
    }
  };

  // ============================================
  // RISK SCORING
  // ============================================

  getRiskScore = async (req: Request, res: Response): Promise<void> => {
    try {
      const { instanceId } = req.params;

      const riskScore = this.antiBanEngine.calculateRiskScore(instanceId);

      res.json({
        success: true,
        data: riskScore,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to calculate risk score');
      res.status(500).json({
        success: false,
        error: 'Failed to calculate risk score',
      });
    }
  };

  // ============================================
  // HUMAN WAKE-UP CYCLE
  // ============================================

  startWakeUpCycle = async (req: Request, res: Response): Promise<void> => {
    try {
      const { instanceId } = req.params;
      const { sessionKeeperUrl } = req.body;

      if (!sessionKeeperUrl) {
        res.status(400).json({
          success: false,
          error: 'sessionKeeperUrl is required',
        });
        return;
      }

      this.antiBanEngine.startHumanWakeUpCycle(instanceId, sessionKeeperUrl);

      res.json({
        success: true,
        message: 'Human wake-up cycle started',
        data: { instanceId },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to start wake-up cycle');
      res.status(500).json({
        success: false,
        error: 'Failed to start wake-up cycle',
      });
    }
  };

  stopWakeUpCycle = async (req: Request, res: Response): Promise<void> => {
    try {
      const { instanceId } = req.params;

      this.antiBanEngine.stopHumanWakeUpCycle(instanceId);

      res.json({
        success: true,
        message: 'Human wake-up cycle stopped',
        data: { instanceId },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to stop wake-up cycle');
      res.status(500).json({
        success: false,
        error: 'Failed to stop wake-up cycle',
      });
    }
  };

  // ============================================
  // ACTIVITY RECORDING
  // ============================================

  recordActivity = async (req: Request, res: Response): Promise<void> => {
    try {
      const { instanceId } = req.params;
      const { type, metadata } = req.body;

      if (!type) {
        res.status(400).json({
          success: false,
          error: 'type is required',
        });
        return;
      }

      this.antiBanEngine.recordActivity(instanceId, { type, metadata });

      res.json({
        success: true,
        message: 'Activity recorded',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to record activity');
      res.status(500).json({
        success: false,
        error: 'Failed to record activity',
      });
    }
  };

  // ============================================
  // STATISTICS
  // ============================================

  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = this.antiBanEngine.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      res.status(500).json({
        success: false,
        error: 'Failed to get stats',
      });
    }
  };

  // ============================================
  // PATTERN ANALYSIS
  // ============================================

  analyzePattern = async (req: Request, res: Response): Promise<void> => {
    try {
      const { instanceId } = req.params;
      const { days = 7 } = req.query;

      // Implementação simplificada - em produção usaria dados reais
      const analysis = {
        instanceId,
        period: {
          start: new Date(Date.now() - parseInt(days as string) * 86400000),
          end: new Date(),
        },
        findings: {
          messageFrequency: 0,
          timeDistribution: new Array(24).fill(0),
          contactDiversity: 0,
          contentDiversity: 0,
          riskIndicators: [],
        },
        recommendations: [
          'Continue using variable intervals',
          'Maintain human-like typing patterns',
        ],
      };

      res.json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze pattern');
      res.status(500).json({
        success: false,
        error: 'Failed to analyze pattern',
      });
    }
  };
}
// ============================================
// ANTI-BAN ENGINE 2.0
// Algoritmo Proprietário de Mitigação de Banimento
// ============================================

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import cron from 'node-cron';
import axios from 'axios';

import { createLogger } from '../utils/logger';
import {
  AntiBanConfig,
  DelayCalculation,
  TypingSimulation,
  HumanBehavior,
  InstanceProfile,
  RiskScore,
  ActivityWindow,
} from '../types';

const logger = createLogger('AntiBanEngine');

// ============================================
// ALGORITMO ANTI-BAN 2.0
// ============================================

export class AntiBanEngine extends EventEmitter {
  private redis: Redis;
  private instanceProfiles: Map<string, InstanceProfile> = new Map();
  private activityWindows: Map<string, ActivityWindow> = new Map();
  private humanWakeUpTasks: Map<string, cron.ScheduledTask> = new Map();
  
  // Configurações do algoritmo
  private readonly TYPING_SPEED_WPM = 45; // Palavras por minuto
  private readonly MIN_INTERVAL_MS = 1500;
  private readonly MAX_INTERVAL_MS = 4500;
  private readonly BUSINESS_HOURS = { start: 9, end: 18 };
  
  // Fatores de risco
  private readonly RISK_THRESHOLDS = {
    LOW: 30,
    MEDIUM: 60,
    HIGH: 80,
    CRITICAL: 95,
  };

  constructor(redisUrl: string) {
    super();
    this.redis = new Redis(redisUrl);
    this.startGlobalMonitoring();
  }

  // ============================================
  // REIVINDICAÇÃO 2: MÉTODO DE MITIGAÇÃO DE BANIMENTO
  // Taxonomia de Intervalos Variáveis
  // ============================================

  /**
   * Calcula o intervalo entre mensagens usando distribuição de probabilidade
   * Nunca retorna um valor fixo - sempre variável
   */
  calculateVariableInterval(config?: Partial<AntiBanConfig>): number {
    const min = config?.minIntervalMs || this.MIN_INTERVAL_MS;
    const max = config?.maxIntervalMs || this.MAX_INTERVAL_MS;
    
    // Distribuição de probabilidade personalizada (mistura de normal e exponencial)
    // Isso cria um padrão mais humano que distribuições puramente aleatórias
    const baseInterval = this.probabilisticInterval(min, max);
    
    // Adicionar variação baseada em fatores contextuais
    const contextualFactor = this.calculateContextualFactor();
    
    // Aplicar fator de risco atual
    const riskFactor = this.getCurrentRiskFactor();
    
    // Intervalo final com todas as variáveis
    const finalInterval = Math.round(
      baseInterval * contextualFactor * riskFactor
    );

    // Garantir que está dentro dos limites
    const clampedInterval = Math.max(min, Math.min(max, finalInterval));
    
    logger.debug({
      baseInterval,
      contextualFactor,
      riskFactor,
      finalInterval: clampedInterval,
    }, 'Variable interval calculated');

    return clampedInterval;
  }

  /**
   * Distribuição de probabilidade para intervalos humanos
   * Usa uma mistura de distribuição normal (comportamento habitual)
   * e exponencial (pausas inesperadas)
   */
  private probabilisticInterval(min: number, max: number): number {
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6;
    
    // 80% das vezes usa distribuição normal (comportamento habitual)
    // 20% das vezes usa distribuição exponencial (pausas inesperadas)
    const useExponential = Math.random() < 0.2;
    
    if (useExponential) {
      // Pausa mais longa (ex: atendendo telefone, distração)
      const lambda = 1 / mean;
      return -Math.log(Math.random()) / lambda;
    } else {
      // Comportamento normal de digitação
      // Box-Muller transform para distribuição normal
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      return mean + z0 * stdDev;
    }
  }

  /**
   * Fator contextual baseado em padrões de uso
   */
  private calculateContextualFactor(): number {
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    
    let factor = 1.0;
    
    // Horário comercial = mais rápido
    if (hour >= this.BUSINESS_HOURS.start && hour <= this.BUSINESS_HOURS.end) {
      factor *= 0.9;
    } else {
      // Fora do horário comercial = mais lento (pessoal)
      factor *= 1.2;
    }
    
    // Fim de semana = mais relaxado
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      factor *= 1.15;
    }
    
    // Variação aleatória pequena
    factor *= 0.95 + Math.random() * 0.1;
    
    return factor;
  }

  /**
   * Fator de risco baseado em atividade recente
   */
  private getCurrentRiskFactor(): number {
    // Implementação simplificada - em produção usaria métricas reais
    return 1.0;
  }

  // ============================================
  // SMART TYPING SIMULATION
  // Simulação de estados de digitação e gravação
  // ============================================

  /**
   * Calcula a duração da simulação de digitação
   * Proporcional ao tamanho do texto
   */
  calculateTypingSimulation(text: string, config?: Partial<AntiBanConfig>): TypingSimulation {
    if (config?.typingSimulation === false) {
      return {
        shouldSimulate: false,
        duration: 0,
        stages: [],
      };
    }

    const charCount = text.length;
    
    // Velocidade de digitação: ~45 WPM = ~225 CPM = ~3.75 CPS
    // Mas com variação realista
    const baseSpeedCPS = 3.5 + Math.random() * 1.0; // 3.5-4.5 chars/second
    
    // Pessoas digitam mais rápido no meio e mais devagar no início/fim
    const startDelay = 500 + Math.random() * 500; // Hesitação inicial
    const endDelay = 300 + Math.random() * 400;   // Revisão final
    
    // Tempo base de digitação
    const baseTypingTime = (charCount / baseSpeedCPS) * 1000;
    
    // Adicionar pausas naturais (a cada ~30 caracteres)
    const pauseCount = Math.floor(charCount / 30);
    const pauseTime = pauseCount * (200 + Math.random() * 300);
    
    // Tempo total
    const totalDuration = Math.round(startDelay + baseTypingTime + pauseTime + endDelay);
    
    // Estágios da simulação
    const stages = this.generateTypingStages(charCount, totalDuration);

    logger.debug({
      charCount,
      baseSpeedCPS: baseSpeedCPS.toFixed(2),
      totalDuration,
      stages: stages.length,
    }, 'Typing simulation calculated');

    return {
      shouldSimulate: true,
      duration: totalDuration,
      stages,
      metadata: {
        charCount,
        speedWPM: Math.round((charCount / 5) / (totalDuration / 60000)),
      },
    };
  }

  /**
   * Gera estágios realistas de digitação
   */
  private generateTypingStages(charCount: number, totalDuration: number): Array<{
    stage: 'composing' | 'paused' | 'recording';
    duration: number;
    progress: number;
  }> {
    const stages: Array<{
      stage: 'composing' | 'paused' | 'recording';
      duration: number;
      progress: number;
    }> = [];

    let currentTime = 0;
    let currentProgress = 0;

    // Estágio inicial: começando a digitar
    stages.push({
      stage: 'composing',
      duration: Math.round(totalDuration * 0.1),
      progress: 0.05,
    });
    currentTime += stages[0].duration;

    // Estágios intermediários: digitação com pausas
    const chunkSize = Math.min(charCount / 5, 50); // Dividir em chunks
    const numChunks = Math.ceil(charCount / chunkSize);

    for (let i = 0; i < numChunks; i++) {
      const isLastChunk = i === numChunks - 1;
      const chunkDuration = (totalDuration * 0.7) / numChunks;
      
      // Digitar este chunk
      stages.push({
        stage: 'composing',
        duration: Math.round(chunkDuration * 0.8),
        progress: currentProgress + (1 / numChunks) * 0.8,
      });
      currentProgress += (1 / numChunks) * 0.8;
      currentTime += chunkDuration * 0.8;

      // Pausa curta (exceto no último chunk)
      if (!isLastChunk && Math.random() < 0.3) {
        stages.push({
          stage: 'paused',
          duration: Math.round(200 + Math.random() * 400),
          progress: currentProgress,
        });
        currentTime += 300;
      }
    }

    // Estágio final: revisão
    stages.push({
      stage: 'paused',
      duration: Math.round(totalDuration * 0.1),
      progress: 1.0,
    });

    return stages;
  }

  /**
   * Calcula simulação de gravação de áudio
   */
  calculateRecordingSimulation(audioDurationMs: number): TypingSimulation {
    // Para áudio, simula o tempo de "gravando..."
    // Geralmente as pessoas pensam antes de gravar
    const thinkingTime = 500 + Math.random() * 1000;
    
    // Tempo de gravação + pequeno atraso
    const recordingTime = audioDurationMs + (100 + Math.random() * 200);

    return {
      shouldSimulate: true,
      duration: Math.round(thinkingTime + recordingTime),
      stages: [
        { stage: 'recording', duration: Math.round(recordingTime), progress: 0.8 },
        { stage: 'paused', duration: Math.round(thinkingTime * 0.3), progress: 1.0 },
      ],
    };
  }

  // ============================================
  // HUMAN WAKE-UP CYCLE
  // Ciclo de atividade humana simulada
  // ============================================

  /**
   * Inicia o ciclo de wake-up humano para uma instância
   */
  startHumanWakeUpCycle(instanceId: string, sessionKeeperUrl: string): void {
    if (this.humanWakeUpTasks.has(instanceId)) {
      logger.warn({ instanceId }, 'Human wake-up cycle already active');
      return;
    }

    logger.info({ instanceId }, 'Starting human wake-up cycle');

    // Agendar ações durante horário comercial
    // Ações ocorrem a cada 15-45 minutos durante o dia
    const task = cron.schedule('*/15 * * * *', async () => {
      await this.performWakeUpAction(instanceId, sessionKeeperUrl);
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo',
    });

    this.humanWakeUpTasks.set(instanceId, task);

    // Criar perfil de instância
    this.instanceProfiles.set(instanceId, {
      id: instanceId,
      createdAt: new Date(),
      messageCount: 0,
      lastActivityAt: new Date(),
      riskScore: 0,
      behaviorPattern: this.generateBehaviorPattern(),
    });
  }

  /**
   * Executa uma ação de wake-up
   */
  private async performWakeUpAction(
    instanceId: string, 
    sessionKeeperUrl: string
  ): Promise<void> {
    const hour = new Date().getHours();
    
    // Só executar durante horário comercial
    if (hour < this.BUSINESS_HOURS.start || hour > this.BUSINESS_HOURS.end) {
      return;
    }

    const actions = [
      { type: 'presence', weight: 0.4, fn: () => this.updatePresence(instanceId, sessionKeeperUrl) },
      { type: 'status_view', weight: 0.3, fn: () => this.simulateStatusView(instanceId, sessionKeeperUrl) },
      { type: 'profile_update', weight: 0.2, fn: () => this.simulateProfileUpdate(instanceId, sessionKeeperUrl) },
      { type: 'read_receipt', weight: 0.1, fn: () => this.simulateReadReceipt(instanceId, sessionKeeperUrl) },
    ];

    // Selecionar ação baseada em peso
    const random = Math.random();
    let cumulativeWeight = 0;
    
    for (const action of actions) {
      cumulativeWeight += action.weight;
      if (random <= cumulativeWeight) {
        try {
          await action.fn();
          logger.debug({ instanceId, action: action.type }, 'Wake-up action performed');
        } catch (error) {
          logger.warn({ instanceId, action: action.type, error }, 'Wake-up action failed');
        }
        break;
      }
    }
  }

  private async updatePresence(
    instanceId: string, 
    sessionKeeperUrl: string
  ): Promise<void> {
    const presence = Math.random() < 0.7 ? 'available' : 'unavailable';
    
    try {
      await axios.post(`${sessionKeeperUrl}/sessions/${instanceId}/presence`, {
        presence,
      }, { timeout: 5000 });
    } catch (error) {
      // Silenciar erro - não é crítico
    }
  }

  private async simulateStatusView(
    instanceId: string, 
    sessionKeeperUrl: string
  ): Promise<void> {
    try {
        await axios.post(`${sessionKeeperUrl}/sessions/${instanceId}/simulate/status-view`, {}, { timeout: 10000 });
        logger.debug({ instanceId }, 'Requested status view simulation');
    } catch (error) {
        logger.warn({ instanceId, error }, 'Failed to request status view simulation');
    }
  }

  private async simulateProfileUpdate(
    instanceId: string, 
    sessionKeeperUrl: string
  ): Promise<void> {
    try {
        await axios.post(`${sessionKeeperUrl}/sessions/${instanceId}/simulate/profile-update`, {}, { timeout: 10000 });
        logger.debug({ instanceId }, 'Requested profile update simulation');
    } catch (error) {
         logger.warn({ instanceId, error }, 'Failed to request profile update simulation');
    }
  }

  private async simulateReadReceipt(
    instanceId: string, 
    sessionKeeperUrl: string
  ): Promise<void> {
    try {
        await axios.post(`${sessionKeeperUrl}/sessions/${instanceId}/simulate/read-random`, {}, { timeout: 10000 });
        logger.debug({ instanceId }, 'Requested random read receipt simulation');
    } catch (error) {
        logger.warn({ instanceId, error }, 'Failed to request random read receipt');
    }
  }

  /**
   * Para o ciclo de wake-up
   */
  stopHumanWakeUpCycle(instanceId: string): void {
    const task = this.humanWakeUpTasks.get(instanceId);
    if (task) {
      task.stop();
      this.humanWakeUpTasks.delete(instanceId);
      this.instanceProfiles.delete(instanceId);
      logger.info({ instanceId }, 'Human wake-up cycle stopped');
    }
  }

  // ============================================
  // RISK SCORING
  // Sistema de pontuação de risco
  // ============================================

  /**
   * Calcula o score de risco de uma instância
   */
  calculateRiskScore(instanceId: string): RiskScore {
    const profile = this.instanceProfiles.get(instanceId);
    if (!profile) {
      return { score: 0, level: 'LOW', factors: [] };
    }

    const factors: string[] = [];
    let score = 0;

    // Fator 1: Volume de mensagens
    const messagesPerHour = this.calculateMessagesPerHour(profile);
    if (messagesPerHour > 100) {
      score += 30;
      factors.push('HIGH_MESSAGE_VOLUME');
    } else if (messagesPerHour > 50) {
      score += 15;
      factors.push('ELEVATED_MESSAGE_VOLUME');
    }

    // Fator 2: Padrão temporal
    const temporalPattern = this.analyzeTemporalPattern(instanceId);
    if (temporalPattern.isSuspicious) {
      score += 25;
      factors.push('SUSPICIOUS_TEMPORAL_PATTERN');
    }

    // Fator 3: Variação de conteúdo
    const contentVariation = this.analyzeContentVariation(instanceId);
    if (contentVariation.isLow) {
      score += 20;
      factors.push('LOW_CONTENT_VARIATION');
    }

    // Fator 4: Taxa de resposta
    const responseRate = this.calculateResponseRate(instanceId);
    if (responseRate < 0.1) {
      score += 15;
      factors.push('LOW_RESPONSE_RATE');
    }

    // Determinar nível
    let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (score >= this.RISK_THRESHOLDS.CRITICAL) {
      level = 'CRITICAL';
    } else if (score >= this.RISK_THRESHOLDS.HIGH) {
      level = 'HIGH';
    } else if (score >= this.RISK_THRESHOLDS.MEDIUM) {
      level = 'MEDIUM';
    }

    // Atualizar perfil
    profile.riskScore = score;
    this.instanceProfiles.set(instanceId, profile);

    return { score, level, factors };
  }

  private calculateMessagesPerHour(profile: InstanceProfile): number {
    const hoursSinceCreation = 
      (Date.now() - profile.createdAt.getTime()) / 3600000;
    return hoursSinceCreation > 0 
      ? profile.messageCount / hoursSinceCreation 
      : 0;
  }

  private analyzeTemporalPattern(instanceId: string): { isSuspicious: boolean } {
    // Análise simplificada - em produção usaria dados reais
    return { isSuspicious: false };
  }

  private analyzeContentVariation(instanceId: string): { isLow: boolean } {
    // Análise simplificada - em produção usaria dados reais
    return { isLow: false };
  }

  private calculateResponseRate(instanceId: string): number {
    // Cálculo simplificado
    return 0.5;
  }

  // ============================================
  // BEHAVIOR PATTERNS
  // ============================================

  private generateBehaviorPattern(): HumanBehavior {
    const patterns: HumanBehavior['patternType'][] = [
      'morning_person',
      'night_owl',
      'steady',
      'burst',
      'weekend_warrior',
    ];

    const patternType = patterns[Math.floor(Math.random() * patterns.length)];

    return {
      patternType,
      activeHours: this.generateActiveHours(patternType),
      typingSpeedVariation: 0.8 + Math.random() * 0.4, // 0.8-1.2
      responseTimeAvg: 30000 + Math.random() * 120000, // 30s-2.5m
      messageLengthAvg: 50 + Math.random() * 150, // 50-200 chars
    };
  }

  private generateActiveHours(pattern: HumanBehavior['patternType']): number[] {
    switch (pattern) {
      case 'morning_person':
        return [8, 9, 10, 11, 12];
      case 'night_owl':
        return [18, 19, 20, 21, 22, 23];
      case 'steady':
        return [9, 10, 11, 14, 15, 16, 17];
      case 'burst':
        return [9, 12, 15, 18];
      case 'weekend_warrior':
        return [10, 11, 14, 15, 16, 17];
      default:
        return [9, 10, 11, 14, 15, 16];
    }
  }

  // ============================================
  // API METHODS
  // ============================================

  /**
   * Calcula delay completo para uma mensagem
   */
  calculateDelay(params: {
    instanceId: string;
    messageType: string;
    contentLength: number;
    config?: Partial<AntiBanConfig>;
  }): DelayCalculation {
    const { instanceId, messageType, contentLength, config } = params;

    // Intervalo base
    const interval = this.calculateVariableInterval(config);

    // Simulação de digitação para textos
    let typingSimulation: TypingSimulation | undefined;
    if (messageType === 'text' && contentLength > 0) {
      const text = 'a'.repeat(contentLength); // Placeholder
      typingSimulation = this.calculateTypingSimulation(text, config);
    }

    // Score de risco atual
    const riskScore = this.calculateRiskScore(instanceId);

    // Ajustar baseado no risco
    let adjustedInterval = interval;
    if (riskScore.level === 'HIGH' || riskScore.level === 'CRITICAL') {
      adjustedInterval *= 2; // Dobrar intervalo em alto risco
    }

    return {
      delay: adjustedInterval,
      typingDuration: typingSimulation?.duration || 0,
      shouldSimulateTyping: typingSimulation?.shouldSimulate || false,
      riskLevel: riskScore.level,
      recommendedAction: this.getRecommendedAction(riskScore),
    };
  }

  private getRecommendedAction(riskScore: RiskScore): string {
    switch (riskScore.level) {
      case 'CRITICAL':
        return 'PAUSE_SENDING';
      case 'HIGH':
        return 'REDUCE_RATE';
      case 'MEDIUM':
        return 'INCREASE_VARIATION';
      case 'LOW':
        return 'CONTINUE_NORMAL';
      default:
        return 'CONTINUE_NORMAL';
    }
  }

  /**
   * Registra atividade de uma instância
   */
  recordActivity(instanceId: string, activity: {
    type: 'message_sent' | 'message_received' | 'login' | 'logout';
    metadata?: Record<string, any>;
  }): void {
    const profile = this.instanceProfiles.get(instanceId);
    if (profile) {
      profile.lastActivityAt = new Date();
      if (activity.type === 'message_sent') {
        profile.messageCount++;
      }
      this.instanceProfiles.set(instanceId, profile);
    }

    // Salvar no Redis para persistência
    this.redis.lpush(
      `activity:${instanceId}`,
      JSON.stringify({
        ...activity,
        timestamp: Date.now(),
      })
    );
    this.redis.ltrim(`activity:${instanceId}`, 0, 999); // Manter últimos 1000
  }

  // ============================================
  // MONITORING
  // ============================================

  private startGlobalMonitoring(): void {
    // Limpar dados antigos periodicamente
    setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // A cada hora
  }

  private cleanupOldData(): void {
    const cutoff = Date.now() - 7 * 24 * 3600000; // 7 dias
    
    for (const [instanceId, profile] of this.instanceProfiles) {
      if (profile.lastActivityAt.getTime() < cutoff) {
        this.stopHumanWakeUpCycle(instanceId);
      }
    }
  }

  /**
   * Retorna estatísticas do engine
   */
  getStats(): {
    activeInstances: number;
    totalMessagesTracked: number;
    averageRiskScore: number;
  } {
    let totalMessages = 0;
    let totalRisk = 0;

    for (const profile of this.instanceProfiles.values()) {
      totalMessages += profile.messageCount;
      totalRisk += profile.riskScore;
    }

    const instanceCount = this.instanceProfiles.size;

    return {
      activeInstances: instanceCount,
      totalMessagesTracked: totalMessages,
      averageRiskScore: instanceCount > 0 ? totalRisk / instanceCount : 0,
    };
  }

  async close(): Promise<void> {
    // Parar todos os ciclos de wake-up
    for (const [instanceId] of this.humanWakeUpTasks) {
      this.stopHumanWakeUpCycle(instanceId);
    }
    
    await this.redis.quit();
  }
}
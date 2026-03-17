// ============================================
// ANTI-BAN ENGINE - TYPES
// Algoritmo Proprietário Anti-Ban 2.0
// ============================================

export interface AntiBanConfig {
  enabled: boolean;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  typingSimulation?: boolean;
  humanWakeUp?: boolean;
  randomizeOrder?: boolean;
  respectBusinessHours?: boolean;
}

export interface DelayCalculation {
  delay: number;
  typingDuration: number;
  shouldSimulateTyping: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedAction: string;
}

export interface TypingSimulation {
  shouldSimulate: boolean;
  duration: number;
  stages: Array<{
    stage: 'composing' | 'paused' | 'recording';
    duration: number;
    progress: number;
  }>;
  metadata?: {
    charCount: number;
    speedWPM: number;
  };
}

export interface HumanBehavior {
  patternType: 'morning_person' | 'night_owl' | 'steady' | 'burst' | 'weekend_warrior';
  activeHours: number[];
  typingSpeedVariation: number;
  responseTimeAvg: number;
  messageLengthAvg: number;
}

export interface InstanceProfile {
  id: string;
  createdAt: Date;
  messageCount: number;
  lastActivityAt: Date;
  riskScore: number;
  behaviorPattern: HumanBehavior;
}

export interface RiskScore {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
}

export interface ActivityWindow {
  instanceId: string;
  date: Date;
  messageCount: number;
  uniqueContacts: Set<string>;
  hourlyDistribution: number[];
}

export interface TemporalPattern {
  isSuspicious: boolean;
  burstiness: number;
  regularity: number;
  offHoursActivity: number;
}

export interface ContentVariation {
  isLow: boolean;
  uniqueness: number;
  templateRatio: number;
  repetitionScore: number;
}

export interface WakeUpAction {
  type: 'presence' | 'status_view' | 'profile_update' | 'read_receipt';
  weight: number;
  execute: () => Promise<void>;
}

export interface AntiBanMetrics {
  totalDelaysCalculated: number;
  averageDelayMs: number;
  typingSimulationsPerformed: number;
  wakeUpActionsPerformed: number;
  riskAssessments: number;
  highRiskInstances: number;
}

export interface PatternAnalysis {
  instanceId: string;
  period: {
    start: Date;
    end: Date;
  };
  findings: {
    messageFrequency: number;
    timeDistribution: number[];
    contactDiversity: number;
    contentDiversity: number;
    riskIndicators: string[];
  };
  recommendations: string[];
}
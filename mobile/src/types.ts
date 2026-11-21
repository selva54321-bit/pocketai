export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
}

export type ActionStatus = 'executed' | 'needs_confirmation' | 'unsupported' | 'error';

export interface AgentResponse {
  status: ActionStatus;
  confidence: number;
  reasoning?: string;
  calls: FunctionCall[];
  proposed_call?: FunctionCall;
  message?: string;
  telemetry?: {
    prefill_tps?: number;
    decode_tps?: number;
    peak_ram_mb?: number;
  };
}

export interface NotificationPayload {
  package_name: string;
  title: string;
  text: string;
  timestamp?: number;
  id?: string;
  category?: string;
  subText?: string;
  isOngoing?: boolean;
  isClearable?: boolean;
}

export interface ParsedTransaction {
  event_type: 'transaction';
  type: 'debit' | 'credit' | 'transfer' | 'refund';
  amount: number;
  currency: string;
  merchant?: string;
  date?: string;
  account_tail?: string;
}

export interface NotificationAnalysis {
  is_transaction: boolean;
  category: 'transaction' | 'promotional' | 'security_alert' | 'system';
  data?: ParsedTransaction | Record<string, any>;
  summary?: string;
  confidence: number;
  raw: NotificationPayload;
}

export type PriorityTier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScoreBreakdown {
  categoryScore: number;
  recencyScore: number;
  appScore: number;
  contentScore: number;
  frequencyPenalty: number;
  reasons: string[];
}

export interface PrioritizedNotification {
  id: string;
  packageName: string;
  title: string;
  text: string;
  subText?: string;
  postTime: number;
  score: number;
  tier: PriorityTier;
  breakdown: ScoreBreakdown;
  isOngoing?: boolean;
  isClearable?: boolean;
  analysis?: NotificationAnalysis;
}

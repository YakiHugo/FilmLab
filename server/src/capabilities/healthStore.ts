import type { ImageProviderId } from "../shared/imageGenerationSchema";

export type ProviderOperation = "generate" | "upscale";

export interface ProviderCallResultInput {
  provider: ImageProviderId;
  model: string;
  operation: ProviderOperation;
  success: boolean;
  latencyMs: number;
  errorType?: string;
  occurredAt?: number;
}

interface ProviderCallEvent {
  success: boolean;
  latencyMs: number;
  errorType?: string;
  occurredAt: number;
}

interface HealthState {
  events: ProviderCallEvent[];
  circuitOpen: boolean;
  circuitOpenedAt: number | null;
  consecutiveFailures: number;
  recoverySuccesses: number;
  lastFailure: { occurredAt: number; errorType?: string } | null;
}

export interface ProviderHealthSnapshot {
  score: number;
  sampleSize: number;
  successRate: number;
  averageLatencyMs: number | null;
  circuitOpen: boolean;
  circuitOpenedAt: string | null;
  lastFailureAt: string | null;
  lastErrorType: string | null;
}

export interface HealthStoreOptions {
  windowMs?: number;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerCooldownMs?: number;
  circuitBreakerRecoverySuccesses?: number;
}

const DEFAULT_OPTIONS: Required<HealthStoreOptions> = {
  windowMs: 15 * 60 * 1000,
  circuitBreakerFailureThreshold: 3,
  circuitBreakerCooldownMs: 30 * 1000,
  circuitBreakerRecoverySuccesses: 2,
};

export class ProviderHealthStore {
  private readonly options: Required<HealthStoreOptions>;
  private readonly states = new Map<string, HealthState>();

  constructor(options: HealthStoreOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  record(result: ProviderCallResultInput) {
    const key = this.key(result.provider, result.model, result.operation);
    const state = this.getOrCreateState(key);
    const occurredAt = result.occurredAt ?? Date.now();

    state.events.push({
      success: result.success,
      latencyMs: Math.max(0, Math.round(result.latencyMs)),
      errorType: result.errorType,
      occurredAt,
    });

    if (result.success) {
      state.consecutiveFailures = 0;
      if (state.circuitOpen) {
        state.recoverySuccesses += 1;
      }
    } else {
      state.lastFailure = {
        occurredAt,
        errorType: result.errorType,
      };
      state.consecutiveFailures += 1;
      state.recoverySuccesses = 0;
    }

    if (!state.circuitOpen && state.consecutiveFailures >= this.options.circuitBreakerFailureThreshold) {
      state.circuitOpen = true;
      state.circuitOpenedAt = occurredAt;
    }

    if (state.circuitOpen && result.success) {
      const cooldownComplete =
        state.circuitOpenedAt !== null &&
        occurredAt - state.circuitOpenedAt >= this.options.circuitBreakerCooldownMs;
      if (cooldownComplete && state.recoverySuccesses >= this.options.circuitBreakerRecoverySuccesses) {
        state.circuitOpen = false;
        state.circuitOpenedAt = null;
        state.recoverySuccesses = 0;
      }
    }

    this.trimOldEvents(state, occurredAt);
  }

  getSnapshot(
    provider: ImageProviderId,
    model: string,
    operation: ProviderOperation,
    now = Date.now()
  ): ProviderHealthSnapshot {
    const key = this.key(provider, model, operation);
    const state = this.states.get(key);
    if (!state) {
      return {
        score: 100,
        sampleSize: 0,
        successRate: 1,
        averageLatencyMs: null,
        circuitOpen: false,
        circuitOpenedAt: null,
        lastFailureAt: null,
        lastErrorType: null,
      };
    }

    this.trimOldEvents(state, now);
    const sampleSize = state.events.length;

    if (sampleSize === 0) {
      return {
        score: state.circuitOpen ? 25 : 100,
        sampleSize,
        successRate: 1,
        averageLatencyMs: null,
        circuitOpen: state.circuitOpen,
        circuitOpenedAt: state.circuitOpenedAt ? new Date(state.circuitOpenedAt).toISOString() : null,
        lastFailureAt: state.lastFailure ? new Date(state.lastFailure.occurredAt).toISOString() : null,
        lastErrorType: state.lastFailure?.errorType ?? null,
      };
    }

    const successCount = state.events.filter((event) => event.success).length;
    const successRate = successCount / sampleSize;
    const averageLatencyMs =
      state.events.reduce((sum, event) => sum + event.latencyMs, 0) / sampleSize;

    const successPoints = successRate * 80;
    const latencyScore = Math.max(0, 1 - averageLatencyMs / 4000);
    const latencyPoints = latencyScore * 20;
    let score = Math.round(successPoints + latencyPoints);
    if (state.circuitOpen) {
      score = Math.min(score, 25);
    }

    return {
      score,
      sampleSize,
      successRate,
      averageLatencyMs: Math.round(averageLatencyMs),
      circuitOpen: state.circuitOpen,
      circuitOpenedAt: state.circuitOpenedAt ? new Date(state.circuitOpenedAt).toISOString() : null,
      lastFailureAt: state.lastFailure ? new Date(state.lastFailure.occurredAt).toISOString() : null,
      lastErrorType: state.lastFailure?.errorType ?? null,
    };
  }

  private getOrCreateState(key: string) {
    const existing = this.states.get(key);
    if (existing) {
      return existing;
    }

    const state: HealthState = {
      events: [],
      circuitOpen: false,
      circuitOpenedAt: null,
      consecutiveFailures: 0,
      recoverySuccesses: 0,
      lastFailure: null,
    };
    this.states.set(key, state);
    return state;
  }

  private trimOldEvents(state: HealthState, now: number) {
    const cutoff = now - this.options.windowMs;
    state.events = state.events.filter((event) => event.occurredAt >= cutoff);
  }

  private key(provider: ImageProviderId, model: string, operation: ProviderOperation) {
    return `${provider}:${model}:${operation}`;
  }
}

export const providerHealthStore = new ProviderHealthStore();

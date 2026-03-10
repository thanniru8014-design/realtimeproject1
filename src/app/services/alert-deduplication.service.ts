import { Injectable } from '@angular/core';
import {
  AlertEvent,
  ActionEvent,
  ThrottleConfig,
  AlertGroupState,
} from '../models/alert.model';

/**
 * Alert De-duplication & Throttling Service (v2)
 *
 * Transforms a stream of monitoring alert events into action events for an incident system,
 * with support for:
 * - Deduplication: Groups identical alerts by fingerprint within a time window
 * - Throttling: Limits escalation frequency
 * - Escalation: Promotes critical alerts
 * - Escape Hatch: P1 alerts bypass throttling
 * - Idempotency: Ensures at-most-once delivery
 * - Quiet Auto-resolution: Auto-resolves after timeout
 */
@Injectable({
  providedIn: 'root',
})
export class AlertDeduplicationService {
  private alertGroups = new Map<string, AlertGroupState>();

  private config: ThrottleConfig = {
    deduplicationWindow: 5000, // 5 seconds
    maxEscalationsPerWindow: 3,
    throttleWindow: 30000, // 30 seconds
    quietResolutionTimeout: 300000, // 5 minutes
    escapeHatchSeverity: 'P1', // P1 bypasses throttling
  };

  constructor() {}

  /**
   * Set custom configuration
   */
  setConfig(config: Partial<ThrottleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Process a single alert event and return resulting action events
   * @param alert The incoming alert event
   * @returns Array of action events to be processed by the incident system
   */
  processAlert(alert: AlertEvent): ActionEvent[] {
    const actions: ActionEvent[] = [];

    // Check idempotency - skip if already processed
    let groupState = this.alertGroups.get(alert.fingerprint);
    if (groupState) {
      if (groupState.processedEventIds.has(alert.id)) {
        return []; // Already processed
      }
    } else {
      // Initialize new group state
      groupState = {
        fingerprint: alert.fingerprint,
        alerts: [],
        maxSeverity: alert.severity,
        escalationCount: 0,
        escalationWindowStart: this.getTimestampMs(alert.timestamp),
        incidentCreatedTime: this.getTimestampMs(alert.timestamp),
        incident_id: this.generateIncidentId(alert.fingerprint),
        hasActiveIncident: false,
        processedEventIds: new Set(),
      };
      this.alertGroups.set(alert.fingerprint, groupState);
    }

    // Mark as processed
    groupState.processedEventIds.add(alert.id);

    // Update max severity
    if (this.compareSeverity(alert.severity, groupState.maxSeverity) > 0) {
      groupState.maxSeverity = alert.severity;
    }

    // Check if this is a duplicate within deduplication window
    const isDuplicate = this.isDuplicateAlert(alert, groupState);
    const now = this.getTimestampMs(alert.timestamp);

    // Cleanup old alerts outside deduplication window
    this.cleanupOldAlerts(groupState, now);

    if (!groupState.hasActiveIncident) {
      // New incident
      const action = this.createEmitIncidentAction(alert, groupState);
      if (action) {
        actions.push(action);
        groupState.hasActiveIncident = true;
        groupState.incidentCreatedTime = now;
      }
    } else if (isDuplicate) {
      // Duplicate alert - decide if escalation or suppress
      if (this.shouldEscalate(alert, groupState, now)) {
        const action = this.createEscalateAction(alert, groupState);
        if (action) {
          actions.push(action);
          groupState.escalationCount++;
        }
      } else {
        // Throttled - suppress
        const action = this.createSuppressAction(alert, groupState);
        if (action) {
          actions.push(action);
        }
      }
    } else {
      // New alert in same group - emit update
      const action = this.createEmitUpdateAction(alert, groupState);
      if (action) {
        actions.push(action);
      }
    }

    // Check for quiet auto-resolution
    if (this.shouldQuietResolve(alert, groupState, now)) {
      const action = this.createQuietResolveAction(alert, groupState);
      if (action) {
        actions.push(action);
        groupState.hasActiveIncident = false;
      }
    }

    return actions;
  }

  /**
   * Process multiple alerts in time order
   */
  processAlerts(alerts: AlertEvent[]): ActionEvent[] {
    const allActions: ActionEvent[] = [];

    for (const alert of alerts) {
      const actions = this.processAlert(alert);
      allActions.push(...actions);
    }

    return allActions;
  }

  /**
   * Check if alert is a duplicate within deduplication window
   */
  private isDuplicateAlert(alert: AlertEvent, groupState: AlertGroupState): boolean {
    if (groupState.alerts.length === 0) {
      return false;
    }

    const lastAlert = groupState.alerts[groupState.alerts.length - 1];
    const lastAlertTime = this.getTimestampMs(lastAlert.timestamp);
    const currentAlertTime = this.getTimestampMs(alert.timestamp);
    const timeDiff = currentAlertTime - lastAlertTime;

    return timeDiff <= this.config.deduplicationWindow;
  }

  /**
   * Remove alerts outside deduplication window
   */
  private cleanupOldAlerts(groupState: AlertGroupState, now: number): void {
    groupState.alerts = groupState.alerts.filter(
      (alert) => now - this.getTimestampMs(alert.timestamp) <= this.config.deduplicationWindow
    );
  }

  /**
   * Determine if escalation should occur
   */
  private shouldEscalate(alert: AlertEvent, groupState: AlertGroupState, now: number): boolean {
    // Escape hatch: alert at escape severity bypasses throttling
    if (alert.severity === this.config.escapeHatchSeverity) {
      return true;
    }

    // Check if we're still in throttle window
    const timeSinceWindowStart = now - groupState.escalationWindowStart;

    if (timeSinceWindowStart < this.config.throttleWindow) {
      // Still in throttle window
      if (groupState.escalationCount >= this.config.maxEscalationsPerWindow) {
        return false; // Throttled
      }
    } else {
      // Outside throttle window - reset counter
      groupState.escalationCount = 0;
      groupState.escalationWindowStart = now;
    }

    return true;
  }

  /**
   * Determine if alert should quiet-resolve
   */
  private shouldQuietResolve(alert: AlertEvent, groupState: AlertGroupState, now: number): boolean {
    // Only quiet-resolve if not at escape severity
    if (alert.severity === this.config.escapeHatchSeverity) {
      return false;
    }

    // Check if enough time has passed since incident creation
    const timeSinceCreation = now - groupState.incidentCreatedTime;

    if (timeSinceCreation >= this.config.quietResolutionTimeout && groupState.hasActiveIncident) {
      return true;
    }

    return false;
  }

  /**
   * Create emit_incident action (new incident)
   */
  private createEmitIncidentAction(alert: AlertEvent, groupState: AlertGroupState): ActionEvent | null {
    return {
      action: 'emit_incident',
      timestamp: alert.timestamp,
      incident_id: groupState.incident_id,
      fingerprint: alert.fingerprint,
      source: alert.source,
      severity: alert.severity,
      reason: 'new',
    };
  }

  /**
   * Create emit_update action (new alert in same group)
   */
  private createEmitUpdateAction(alert: AlertEvent, groupState: AlertGroupState): ActionEvent | null {
    return {
      action: 'emit_update',
      timestamp: alert.timestamp,
      incident_id: groupState.incident_id,
      fingerprint: alert.fingerprint,
      source: alert.source,
      severity: alert.severity,
      reason: 'update',
    };
  }

  /**
   * Create escalate action
   */
  private createEscalateAction(alert: AlertEvent, groupState: AlertGroupState): ActionEvent | null {
    return {
      action: 'emit_update',
      timestamp: alert.timestamp,
      incident_id: groupState.incident_id,
      fingerprint: alert.fingerprint,
      source: alert.source,
      severity: groupState.maxSeverity, // Use max severity
      reason: 'escalated',
      escalated: true,
    };
  }

  /**
   * Create suppress action (throttled)
   */
  private createSuppressAction(alert: AlertEvent, groupState: AlertGroupState): ActionEvent | null {
    return {
      action: 'suppress',
      timestamp: alert.timestamp,
      incident_id: groupState.incident_id,
      fingerprint: alert.fingerprint,
      source: alert.source,
      severity: alert.severity,
      reason: 'throttle',
    };
  }

  /**
   * Create quiet resolve action
   */
  private createQuietResolveAction(alert: AlertEvent, groupState: AlertGroupState): ActionEvent | null {
    return {
      action: 'emit_resolve',
      timestamp: alert.timestamp,
      incident_id: groupState.incident_id,
      fingerprint: alert.fingerprint,
      source: alert.source,
      severity: alert.severity,
      reason: 'quiet_resolve',
    };
  }

  /**
   * Compare two severities: P1 > P2 > P3
   * Returns: > 0 if s1 is higher, < 0 if s2 is higher, 0 if equal
   */
  private compareSeverity(s1: string, s2: string): number {
    const severityOrder = { P1: 3, P2: 2, P3: 1 };
    return (severityOrder[s1 as keyof typeof severityOrder] || 0) - 
           (severityOrder[s2 as keyof typeof severityOrder] || 0);
  }

  /**
   * Convert ISO8601 timestamp to milliseconds since epoch
   */
  private getTimestampMs(timestamp: string): number {
    return new Date(timestamp).getTime();
  }

  /**
   * Get current ISO8601 timestamp
   */
  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Generate incident ID from fingerprint
   */
  private generateIncidentId(fingerprint: string): string {
    return `inc-${fingerprint}`;
  }

  /**
   * Clear all state (useful for testing)
   */
  reset(): void {
    this.alertGroups.clear();
  }

  /**
   * Get current alert group state (for testing/debugging)
   */
  getGroupState(fingerprint: string): AlertGroupState | undefined {
    return this.alertGroups.get(fingerprint);
  }
}

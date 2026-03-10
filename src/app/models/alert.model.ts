/**
 * Alert Event Model
 * Represents incoming monitoring alerts from the system
 */
export interface AlertEvent {
  /** Unique raw event ID (used for idempotency) */
  id: string;
  
  /** Emitting source/node identifier */
  source: string;
  
  /** Stable hash that groups the same logical alert */
  fingerprint: string;
  
  /** Severity level: "P1" (critical), "P2" (high), "P3" (medium) */
  severity: "P1" | "P2" | "P3";
  
  /** ISO8601 UTC timestamp when the alert was generated */
  timestamp: string;
  
  /** Optional alert message/description */
  message?: string;
  
  /** Optional labels for grouping/filtering */
  labels?: Record<string, string>;
  
  /** Optional custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Action Event Model
 * Represents resulting actions to be taken by the incident system
 */
export interface ActionEvent {
  /** Type of action: emit_incident, emit_update, emit_resolve, suppress */
  action: "emit_incident" | "emit_update" | "emit_resolve" | "suppress";
  
  /** ISO8601 UTC timestamp when the action was generated */
  timestamp: string;
  
  /** Stable incident ID derived from fingerprint */
  incident_id: string;
  
  /** Fingerprint of the logical alert group */
  fingerprint: string;
  
  /** Source that generated the alert */
  source: string;
  
  /** Severity level */
  severity: "P1" | "P2" | "P3";
  
  /** Reason for the action: new, update, escalated, quiet_resolve, throttle */
  reason: "new" | "update" | "escalated" | "quiet_resolve" | "throttle";
  
  /** True if the incident was escalated (included when reason=escalated) */
  escalated?: boolean;
}

/**
 * Configuration for alert processing behavior
 */
export interface ThrottleConfig {
  /** Minutes before auto-resolving a quiet incident */
  quiet_period_minutes: number;
  
  /** Maximum actions emitted per source per minute (excludes emit_resolve) */
  max_per_minute_per_source: number;
  
  /** Alert count threshold before escalation is triggered */
  escalate_after: number;
  
  /** Severities that bypass throttling (e.g., ["P1"]) */
  priority_severities: ("P1" | "P2" | "P3")[];
}

/**
 * Internal state tracking for an incident
 */
export interface IncidentState {
  /** Unique fingerprint identifying this incident */
  fingerprint: string;
  
  /** Stable incident ID (inc-<fingerprint>) */
  incident_id: string;
  
  /** Highest severity seen in this incident - P1 > P2 > P3 */
  maxSeverity: "P1" | "P2" | "P3";
  
  /** ISO8601 timestamp when this incident was created */
  created_at: string;
  
  /** ISO8601 timestamp when this incident last saw an alert */
  last_seen: string;
  
  /** Whether this incident is currently open */
  open: boolean;
  
  /** Total count of alerts for this incident */
  alert_count: number;
  
  /** Whether escalation has been triggered for this incident */
  escalated: boolean;
  
  /** Set of processed event IDs for idempotency */
  processed_ids: Set<string>;
}

/**
 * Per-source throttle tracking
 */
export interface SourceThrottle {
  /** Action timestamps in the current minute (milliseconds) */
  timestamps: number[];
  
  /** Start of current minute window (milliseconds) */
  minute_start: number;
}

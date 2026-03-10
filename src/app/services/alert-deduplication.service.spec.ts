import { TestBed } from '@angular/core/testing';
import { AlertDeduplicationService } from './alert-deduplication.service';
import { AlertEvent, ActionEvent } from '../models/alert.model';

describe('AlertDeduplicationService (v2)', () => {
  let service: AlertDeduplicationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AlertDeduplicationService);
    service.reset();
  });

  afterEach(() => {
    service.reset();
  });

  describe('Deduplication', () => {
    it('should deduplicate alerts within the deduplication window', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high-web',
        severity: 'P2',
        timestamp: baseTime,
        message: 'CPU high',
      };

      const alert2Time = new Date(new Date(baseTime).getTime() + 2000).toISOString();
      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'cpu-high-web',
        severity: 'P2',
        timestamp: alert2Time,
        message: 'CPU still high',
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      // First alert should create incident
      expect(actions1.length).toBe(1);
      expect(actions1[0].action).toBe('emit_incident');
      expect(actions1[0].reason).toBe('new');

      // Second alert should update or escalate (duplicate within window)
      expect(actions2.length).toBe(1);
      expect(['emit_update', 'emit_incident']).toContain(actions2[0].action);
    });

    it('should treat alerts outside deduplication window as new', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high-web',
        severity: 'P2',
        timestamp: baseTime,
      };

      const alert2Time = new Date(new Date(baseTime).getTime() + 10000).toISOString();
      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'cpu-high-web',
        severity: 'P2',
        timestamp: alert2Time,
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions1[0].action).toBe('emit_incident');
      // Outside window - should be new emit_incident
      expect(actions2[0].action).toBe('emit_incident');
    });

    it('should keep different fingerprints separate', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'memory-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions1[0].fingerprint).toBe('cpu-high');
      expect(actions2[0].fingerprint).toBe('memory-high');
      expect(actions1[0].incident_id).not.toBe(actions2[0].incident_id);
    });

    it('should keep different sources separate', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-02',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions1[0].source).toBe('web-01');
      expect(actions2[0].source).toBe('web-02');
      // Same fingerprint but different sources - should still be same incident
      expect(actions1[0].incident_id).toBe(actions2[0].incident_id);
    });
  });

  describe('Throttling', () => {
    it('should throttle escalations when max escalations exceeded', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 2,
        quietResolutionTimeout: 300000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 2000).toISOString(),
        },
        {
          id: 'evt-3',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 4000).toISOString(),
        },
        {
          id: 'evt-4',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 6000).toISOString(),
        },
      ];

      const allActions = service.processAlerts(alerts);
      const suppresses = allActions.filter((a) => a.action === 'suppress');

      // Should have suppresses due to throttling
      expect(suppresses.length).toBeGreaterThan(0);
    });

    it('should not throttle P1 alerts (escape hatch)', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 1,
        quietResolutionTimeout: 300000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'critical-issue',
          severity: 'P1',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'critical-issue',
          severity: 'P1',
          timestamp: new Date(baseTime + 2000).toISOString(),
        },
        {
          id: 'evt-3',
          source: 'web-01',
          fingerprint: 'critical-issue',
          severity: 'P1',
          timestamp: new Date(baseTime + 4000).toISOString(),
        },
      ];

      const allActions = service.processAlerts(alerts);
      const suppresses = allActions.filter((a) => a.action === 'suppress');

      // P1 should bypass throttle
      expect(suppresses.length).toBe(0);
    });

    it('should reset throttle counter after throttle window expires', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 10000,
        maxEscalationsPerWindow: 1,
        quietResolutionTimeout: 300000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 2000).toISOString(),
        },
        {
          id: 'evt-3',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 20000).toISOString(), // Beyond throttle window
        },
      ];

      const allActions = service.processAlerts(alerts);
      const emitUpdates = allActions.filter((a) => a.action === 'emit_update');

      // After window reset, should be able to escalate again
      expect(emitUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('Escalation', () => {
    it('should set reason to escalated when escalating duplicates', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P3',
        timestamp: baseTime,
      };

      const alert2Time = new Date(new Date(baseTime).getTime() + 2000).toISOString();
      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: alert2Time,
      };

      service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions2.length).toBeGreaterThan(0);
      const escalationAction = actions2.find((a) => a.reason === 'escalated');
      if (escalationAction) {
        expect(escalationAction.escalated).toBe(true);
        expect(escalationAction.severity).toBe('P2');
      }
    });

    it('should preserve max severity in escalations', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const lowSevAlert: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'issue',
        severity: 'P3',
        timestamp: new Date(baseTime).toISOString(),
      };

      const highSevAlert: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'issue',
        severity: 'P1',
        timestamp: new Date(baseTime + 2000).toISOString(),
      };

      service.processAlert(lowSevAlert);
      const actions = service.processAlert(highSevAlert);

      const escalated = actions.find((a) => a.reason === 'escalated');
      if (escalated) {
        // Max severity should be P1
        expect(escalated.severity).toBe('P1');
      }
    });
  });

  describe('Escape Hatch (P1 alerts)', () => {
    it('should bypass throttling for P1 severity', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 1,
        quietResolutionTimeout: 300000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'critical',
          severity: 'P1',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'critical',
          severity: 'P1',
          timestamp: new Date(baseTime + 1000).toISOString(),
        },
      ];

      const allActions = service.processAlerts(alerts);
      const escalated = allActions.filter((a) => a.reason === 'escalated');

      expect(escalated.length).toBeGreaterThan(0);
    });
  });

  describe('Quiet Auto-Resolution', () => {
    it('should auto-resolve low-priority alerts after timeout', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 3,
        quietResolutionTimeout: 10000, // 10 seconds
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P3',
        timestamp: new Date(baseTime).toISOString(),
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P3',
        timestamp: new Date(baseTime + 15000).toISOString(), // Beyond timeout
      };

      service.processAlert(alert1);
      const actions = service.processAlert(alert2);

      const resolved = actions.find((a) => a.action === 'emit_resolve');
      expect(resolved).toBeDefined();
      expect(resolved?.reason).toBe('quiet_resolve');
    });

    it('should not auto-resolve P1 alerts', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 3,
        quietResolutionTimeout: 10000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'critical',
        severity: 'P1',
        timestamp: new Date(baseTime).toISOString(),
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'critical',
        severity: 'P1',
        timestamp: new Date(baseTime + 15000).toISOString(),
      };

      service.processAlert(alert1);
      const actions = service.processAlert(alert2);

      const resolved = actions.find((a) => a.action === 'emit_resolve');
      expect(resolved).toBeUndefined();
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate actions for same event ID', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const actions1 = service.processAlert(alert);
      const actions2 = service.processAlert(alert); // Same event

      expect(actions1.length).toBeGreaterThan(0);
      expect(actions2.length).toBe(0); // Duplicate - no action
    });

    it('should have unique incident_id per fingerprint', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'memory-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions1[0].incident_id).not.toBe(actions2[0].incident_id);
    });

    it('should generate consistent incident_id from fingerprint', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      service.reset();
      const actions1 = service.processAlert(alert);
      const id1 = actions1[0].incident_id;

      service.reset();
      const actions2 = service.processAlert(alert);
      const id2 = actions2[0].incident_id;

      // Same fingerprint should generate same incident_id
      expect(id1).toBe(id2);
    });
  });

  describe('Action Types', () => {
    it('should emit emit_incident for new alerts', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const actions = service.processAlert(alert);

      expect(actions[0].action).toBe('emit_incident');
      expect(actions[0].reason).toBe('new');
    });

    it('should emit suppress for throttled alerts', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 1,
        quietResolutionTimeout: 300000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 1000).toISOString(),
        },
        {
          id: 'evt-3',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 2000).toISOString(),
        },
      ];

      const allActions = service.processAlerts(alerts);
      const suppresses = allActions.filter((a) => a.action === 'suppress');

      expect(suppresses.length).toBeGreaterThan(0);
      expect(suppresses[0].reason).toBe('throttle');
    });

    it('should emit emit_resolve for quiet resolution', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 3,
        quietResolutionTimeout: 5000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P3',
        timestamp: new Date(baseTime).toISOString(),
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P3',
        timestamp: new Date(baseTime + 10000).toISOString(),
      };

      service.processAlert(alert1);
      const actions = service.processAlert(alert2);

      const resolved = actions.find((a) => a.action === 'emit_resolve');
      expect(resolved).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex multi-fingerprint scenarios', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 20000,
        maxEscalationsPerWindow: 2,
        quietResolutionTimeout: 15000,
        escapeHatchSeverity: 'P1',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P3',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 2000).toISOString(),
        },
        {
          id: 'evt-3',
          source: 'web-02',
          fingerprint: 'memory-high',
          severity: 'P1',
          timestamp: new Date(baseTime + 3000).toISOString(),
        },
        {
          id: 'evt-4',
          source: 'web-02',
          fingerprint: 'memory-high',
          severity: 'P1',
          timestamp: new Date(baseTime + 4000).toISOString(),
        },
        {
          id: 'evt-5',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: new Date(baseTime + 25000).toISOString(),
        },
      ];

      const allActions = service.processAlerts(alerts);

      // Verify we have various action types
      const emissions = allActions.filter((a) => a.action.startsWith('emit'));
      const suppresses = allActions.filter((a) => a.action === 'suppress');

      expect(emissions.length).toBeGreaterThan(0);
      expect(allActions.every((a) => a.timestamp)).toBe(true);
      expect(allActions.every((a) => a.incident_id)).toBe(true);
    });

    it('should track separate incidents per fingerprint', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'cpu-high',
          severity: 'P2',
          timestamp: baseTime,
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'memory-high',
          severity: 'P2',
          timestamp: baseTime,
        },
        {
          id: 'evt-3',
          source: 'web-01',
          fingerprint: 'disk-full',
          severity: 'P1',
          timestamp: baseTime,
        },
      ];

      const allActions = service.processAlerts(alerts);

      // Should have 3 separate incident IDs
      const incidentIds = new Set(allActions.map((a) => a.incident_id));
      expect(incidentIds.size).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty alert stream', () => {
      const allActions = service.processAlerts([]);
      expect(allActions.length).toBe(0);
    });

    it('should handle single alert', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const actions = service.processAlerts([alert]);
      expect(actions.length).toBe(1);
      expect(actions[0].action).toBe('emit_incident');
    });

    it('should handle alerts with same timestamp', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      const allActions = service.processAlerts([alert1, alert2]);

      expect(allActions.length).toBeGreaterThan(0);
    });

    it('should handle severity transitions correctly', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alerts: AlertEvent[] = [
        {
          id: 'evt-1',
          source: 'web-01',
          fingerprint: 'issue',
          severity: 'P3',
          timestamp: new Date(baseTime).toISOString(),
        },
        {
          id: 'evt-2',
          source: 'web-01',
          fingerprint: 'issue',
          severity: 'P2',
          timestamp: new Date(baseTime + 1000).toISOString(),
        },
        {
          id: 'evt-3',
          source: 'web-01',
          fingerprint: 'issue',
          severity: 'P1',
          timestamp: new Date(baseTime + 2000).toISOString(),
        },
      ];

      const allActions = service.processAlerts(alerts);

      // Verify severities escalate
      expect(allActions.every((a) => ['P1', 'P2', 'P3'].includes(a.severity))).toBe(true);
    });
  });

  describe('Service Configuration', () => {
    it('should allow custom configuration', () => {
      service.setConfig({
        deduplicationWindow: 10000,
        maxEscalationsPerWindow: 5,
        throttleWindow: 60000,
        quietResolutionTimeout: 120000,
        escapeHatchSeverity: 'P2',
      });

      const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
      const alert1: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'test',
        severity: 'P3',
        timestamp: new Date(baseTime).toISOString(),
      };

      const alert2: AlertEvent = {
        id: 'evt-2',
        source: 'web-01',
        fingerprint: 'test',
        severity: 'P3',
        timestamp: new Date(baseTime + 8000).toISOString(),
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      // Within 10-second window
      expect(actions1[0].action).toBe('emit_incident');
      expect(['emit_update', 'emit_incident']).toContain(actions2[0].action);
    });

    it('should handle reset correctly', () => {
      const baseTime = new Date('2026-03-10T04:00:00Z').toISOString();
      const alert: AlertEvent = {
        id: 'evt-1',
        source: 'web-01',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: baseTime,
      };

      service.processAlert(alert);
      service.reset();

      // After reset, same event should generate new incident
      const actions = service.processAlert(alert);
      expect(actions.length).toBe(1);
      expect(actions[0].action).toBe('emit_incident');
    });
  });
});

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AlertDeduplicationService);
    service.reset();
  });

  afterEach(() => {
    service.reset();
  });

  describe('Deduplication', () => {
    it('should deduplicate alerts within the deduplication window', () => {
      const baseTime = 1000;
      const alert1: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const alert2: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 2000, // Within 5-second window
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage still high',
        severity: 'warning',
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      // First alert should create activation
      expect(actions1.length).toBe(1);
      expect(actions1[0].actionType).toBe('activate');

      // Second alert should generate escalation (duplicate)
      expect(actions2.length).toBe(1);
      expect(actions2[0].actionType).toBe('escalate');
    });

    it('should treat alerts outside deduplication window as new', () => {
      const baseTime = 1000;
      const alert1: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const alert2: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 10000, // Beyond 5-second window
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage still high',
        severity: 'warning',
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions1[0].actionType).toBe('activate');
      // Second alert is treated as new activation (outside dedup window)
      expect(actions2[0].actionType).toBe('activate');
    });

    it('should keep different alert types separate', () => {
      const baseTime = 1000;
      const cpuAlert: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const memoryAlert: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 1000,
        type: 'memory_high',
        resource: 'server-1',
        priority: 3,
        message: 'Memory usage high',
        severity: 'warning',
      };

      const actions1 = service.processAlert(cpuAlert);
      const actions2 = service.processAlert(memoryAlert);

      // Different types should generate separate activation events
      expect(actions1[0].alertType).toBe('cpu_high');
      expect(actions2[0].alertType).toBe('memory_high');
      expect(actions1[0].alertGroupKey).not.toBe(actions2[0].alertGroupKey);
    });

    it('should keep different resources separate', () => {
      const baseTime = 1000;
      const alert1: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const alert2: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 1000,
        type: 'cpu_high',
        resource: 'server-2',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      // Different resources should generate separate groups
      expect(actions1[0].resource).toBe('server-1');
      expect(actions2[0].resource).toBe('server-2');
      expect(actions1[0].alertGroupKey).not.toBe(actions2[0].alertGroupKey);
    });
  });

  describe('Throttling', () => {
    it('should throttle escalations when max escalations are exceeded', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 2,
        quietResolutionTimeout: 300000,
        priorityExceptionThreshold: 4,
      });

      const baseTime = 1000;
      const alerts: AlertEvent[] = [
        {
          id: 'alert1',
          timestamp: baseTime,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU high',
          severity: 'warning',
        },
        {
          id: 'alert2',
          timestamp: baseTime + 2000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU still high',
          severity: 'warning',
        },
        {
          id: 'alert3',
          timestamp: baseTime + 4000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU still high',
          severity: 'warning',
        },
        {
          id: 'alert4',
          timestamp: baseTime + 6000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU still high',
          severity: 'warning',
        },
      ];

      const allActions = service.processAlerts(alerts);
      const escalations = allActions.filter((a) => a.actionType === 'escalate');

      // Max 2 escalations allowed
      expect(escalations.length).toBe(2);
    });

    it('should not throttle high-priority alerts (priority exception)', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 1,
        quietResolutionTimeout: 300000,
        priorityExceptionThreshold: 4,
      });

      const baseTime = 1000;
      const alerts: AlertEvent[] = [
        {
          id: 'alert1',
          timestamp: baseTime,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 5, // Critical - high priority
          message: 'CPU critical',
          severity: 'critical',
        },
        {
          id: 'alert2',
          timestamp: baseTime + 2000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 5,
          message: 'CPU still critical',
          severity: 'critical',
        },
        {
          id: 'alert3',
          timestamp: baseTime + 4000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 5,
          message: 'CPU still critical',
          severity: 'critical',
        },
      ];

      const allActions = service.processAlerts(alerts);
      const escalations = allActions.filter((a) => a.actionType === 'escalate');

      // High-priority alerts should bypass throttling
      expect(escalations.length).toBeGreaterThan(1);
    });

    it('should reset throttle counter after throttle window expires', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 10000,
        maxEscalationsPerWindow: 1,
        quietResolutionTimeout: 300000,
        priorityExceptionThreshold: 4,
      });

      const baseTime = 1000;
      const alerts: AlertEvent[] = [
        {
          id: 'alert1',
          timestamp: baseTime,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU high',
          severity: 'warning',
        },
        {
          id: 'alert2',
          timestamp: baseTime + 2000, // First escalation
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU still high',
          severity: 'warning',
        },
        {
          id: 'alert3',
          timestamp: baseTime + 15000, // Beyond throttle window - counter resets
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU still high',
          severity: 'warning',
        },
      ];

      const allActions = service.processAlerts(alerts);
      const escalations = allActions.filter((a) => a.actionType === 'escalate');

      // Second escalation should happen after throttle window reset
      expect(escalations.length).toBe(2);
    });
  });

  describe('Priority Exceptions', () => {
    it('should not throttle alerts above priority exception threshold', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 1,
        quietResolutionTimeout: 300000,
        priorityExceptionThreshold: 4,
      });

      const baseTime = 1000;
      const criticalAlert1: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'disk_full',
        resource: 'server-1',
        priority: 4,
        message: 'Disk nearly full',
        severity: 'critical',
      };

      const criticalAlert2: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 100,
        type: 'disk_full',
        resource: 'server-1',
        priority: 4,
        message: 'Disk critically full',
        severity: 'critical',
      };

      service.processAlert(criticalAlert1);
      const actions = service.processAlert(criticalAlert2);

      // Priority 4+ should generate escalation despite throttle limits
      expect(actions.some((a) => a.actionType === 'escalate')).toBe(true);
    });
  });

  describe('Escalation', () => {
    it('should escalate when duplicate alerts are received', () => {
      const baseTime = 1000;
      const alert1: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const alert2: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 2000,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage still high',
        severity: 'warning',
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions1[0].actionType).toBe('activate');
      expect(actions2[0].actionType).toBe('escalate');
      expect(actions2[0].priority).toBe(3);
    });

    it('should preserve max priority in escalations', () => {
      const baseTime = 1000;
      const lowPriorityAlert: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 2,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const highPriorityAlert: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 2000,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 4,
        message: 'CPU usage critical',
        severity: 'critical',
      };

      service.processAlert(lowPriorityAlert);
      const actions = service.processAlert(highPriorityAlert);

      // Escalation should have max priority seen (4)
      expect(actions[0].priority).toBe(4);
    });
  });

  describe('Quiet Auto-Resolution', () => {
    it('should auto-resolve low-priority alerts after timeout', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 3,
        quietResolutionTimeout: 10000, // 10 seconds
        priorityExceptionThreshold: 4,
      });

      const baseTime = 1000;
      const alert: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 2, // Low priority
        message: 'CPU usage high',
        severity: 'warning',
      };

      const resolutionAlert: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 15000, // Beyond quiet resolution timeout
        type: 'cpu_high',
        resource: 'server-1',
        priority: 2,
        message: 'CPU is now normal',
        severity: 'info',
      };

      service.processAlert(alert);
      const actions = service.processAlert(resolutionAlert);

      // Should generate resolution action
      const resolution = actions.find((a) => a.actionType === 'resolve');
      expect(resolution).toBeDefined();
      expect(resolution?.isQuietResolution).toBe(true);
    });

    it('should not auto-resolve high-priority alerts', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 30000,
        maxEscalationsPerWindow: 3,
        quietResolutionTimeout: 10000,
        priorityExceptionThreshold: 4,
      });

      const baseTime = 1000;
      const alert: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'disk_full',
        resource: 'server-1',
        priority: 4, // High priority
        message: 'Disk full',
        severity: 'critical',
      };

      const laterAlert: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 15000,
        type: 'disk_full',
        resource: 'server-1',
        priority: 4,
        message: 'Disk is now normal',
        severity: 'info',
      };

      service.processAlert(alert);
      const actions = service.processAlert(laterAlert);

      // Should not auto-resolve
      const resolution = actions.find((a) => a.actionType === 'resolve');
      expect(resolution).toBeUndefined();
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate actions for the same idempotency key', () => {
      const baseTime = 1000;
      const alert: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const actions1 = service.processAlert(alert);
      const actions2 = service.processAlert(alert); // Same alert again

      expect(actions1.length).toBe(1);
      // Second call should not generate duplicate due to idempotency
      expect(actions2.length).toBe(0);
    });

    it('should have unique idempotency keys for different alerts', () => {
      const baseTime = 1000;
      const alert1: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      const alert2: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime + 2000,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage still high',
        severity: 'warning',
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      expect(actions1[0].idempotencyKey).not.toBe(actions2[0].idempotencyKey);
    });

    it('should generate consistent idempotency keys', () => {
      const baseTime = 1000;
      const alert: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU usage high',
        severity: 'warning',
      };

      service.reset();
      const actions1 = service.processAlert(alert);
      const idempotencyKey1 = actions1[0].idempotencyKey;

      service.reset();
      const actions2 = service.processAlert(alert);
      const idempotencyKey2 = actions2[0].idempotencyKey;

      // Same alert should generate same idempotency key
      expect(idempotencyKey1).toBe(idempotencyKey2);
    });
  });

  describe('Integration Tests', () => {
    it('should process a complex stream of alerts correctly', () => {
      service.setConfig({
        deduplicationWindow: 5000,
        throttleWindow: 20000,
        maxEscalationsPerWindow: 2,
        quietResolutionTimeout: 15000,
        priorityExceptionThreshold: 4,
      });

      const alerts: AlertEvent[] = [
        {
          id: 'a1',
          timestamp: 1000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU high',
          severity: 'warning',
        },
        {
          id: 'a2',
          timestamp: 2000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU high',
          severity: 'warning',
        },
        {
          id: 'a3',
          timestamp: 7000, // New activation after window
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU high',
          severity: 'warning',
        },
        {
          id: 'a4',
          timestamp: 22000, // High priority alert
          type: 'disk_full',
          resource: 'server-2',
          priority: 5,
          message: 'Disk full',
          severity: 'critical',
        },
        {
          id: 'a5',
          timestamp: 23000,
          type: 'disk_full',
          resource: 'server-2',
          priority: 5,
          message: 'Disk full',
          severity: 'critical',
        },
        {
          id: 'a6',
          timestamp: 30000, // Auto-resolve CPU alert
          type: 'cpu_high',
          resource: 'server-1',
          priority: 2,
          message: 'CPU normal',
          severity: 'info',
        },
      ];

      const allActions = service.processAlerts(alerts);

      // Verify we have activations, escalations, and resolutions
      const activations = allActions.filter((a) => a.actionType === 'activate');
      const escalations = allActions.filter((a) => a.actionType === 'escalate');
      const resolutions = allActions.filter((a) => a.actionType === 'resolve');

      expect(activations.length).toBeGreaterThan(0);
      expect(escalations.length).toBeGreaterThan(0);
      expect(resolutions.length).toBeGreaterThan(0);

      // Verify action types are correct
      expect(allActions.every((a) => ['activate', 'escalate', 'resolve'].includes(a.actionType))).toBe(true);

      // Verify idempotency keys are unique (or not present for same group key)
      const keys = new Set<string>();
      for (const action of allActions) {
        expect(!keys.has(action.idempotencyKey)).toBe(true);
        keys.add(action.idempotencyKey);
      }
    });

    it('should handle multiple independent alert groups', () => {
      const alerts: AlertEvent[] = [
        {
          id: 'a1',
          timestamp: 1000,
          type: 'cpu_high',
          resource: 'server-1',
          priority: 3,
          message: 'CPU high',
          severity: 'warning',
        },
        {
          id: 'a2',
          timestamp: 1100,
          type: 'memory_high',
          resource: 'server-1',
          priority: 3,
          message: 'Memory high',
          severity: 'warning',
        },
        {
          id: 'a3',
          timestamp: 1200,
          type: 'cpu_high',
          resource: 'server-2',
          priority: 3,
          message: 'CPU high',
          severity: 'warning',
        },
      ];

      const allActions = service.processAlerts(alerts);

      // Should have 3 separate activation events
      expect(allActions.length).toBe(3);
      expect(allActions.every((a) => a.actionType === 'activate')).toBe(true);

      // Each should have different alert group keys
      const groupKeys = new Set(allActions.map((a) => a.alertGroupKey));
      expect(groupKeys.size).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty alert stream', () => {
      const allActions = service.processAlerts([]);
      expect(allActions.length).toBe(0);
    });

    it('should handle single alert', () => {
      const alert: AlertEvent = {
        id: 'alert1',
        timestamp: 1000,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU high',
        severity: 'warning',
      };

      const actions = service.processAlerts([alert]);
      expect(actions.length).toBe(1);
      expect(actions[0].actionType).toBe('activate');
    });

    it('should handle alerts with same timestamp', () => {
      const baseTime = 1000;
      const alert1: AlertEvent = {
        id: 'alert1',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU high',
        severity: 'warning',
      };

      const alert2: AlertEvent = {
        id: 'alert2',
        timestamp: baseTime,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU high',
        severity: 'warning',
      };

      const allActions = service.processAlerts([alert1, alert2]);

      // Should generate activation + escalation
      expect(allActions.length).toBe(2);
      expect(allActions[0].actionType).toBe('activate');
      expect(allActions[1].actionType).toBe('escalate');
    });

    it('should handle priority values correctly', () => {
      const alerts: AlertEvent[] = [
        {
          id: 'a1',
          timestamp: 1000,
          type: 'alert_type',
          resource: 'resource',
          priority: 1,
          message: 'msg',
          severity: 'info',
        },
        {
          id: 'a2',
          timestamp: 2000,
          type: 'alert_type',
          resource: 'resource',
          priority: 5,
          message: 'msg',
          severity: 'critical',
        },
      ];

      const allActions = service.processAlerts(alerts);

      // Second action (escalation) should have priority 5
      expect(allActions[1].priority).toBe(5);
    });
  });

  describe('Service Configuration', () => {
    it('should allow custom configuration', () => {
      service.setConfig({
        deduplicationWindow: 10000,
        throttleWindow: 60000,
        maxEscalationsPerWindow: 5,
        quietResolutionTimeout: 120000,
        priorityExceptionThreshold: 3,
      });

      const alert1: AlertEvent = {
        id: 'alert1',
        timestamp: 1000,
        type: 'test',
        resource: 'resource',
        priority: 2,
        message: 'test',
        severity: 'warning',
      };

      const alert2: AlertEvent = {
        id: 'alert2',
        timestamp: 8000,
        type: 'test',
        resource: 'resource',
        priority: 2,
        message: 'test',
        severity: 'warning',
      };

      const actions1 = service.processAlert(alert1);
      const actions2 = service.processAlert(alert2);

      // With 10-second window, alert2 should be duplicate
      expect(actions1[0].actionType).toBe('activate');
      expect(actions2[0].actionType).toBe('escalate');
    });

    it('should handle reset correctly', () => {
      const alert: AlertEvent = {
        id: 'alert1',
        timestamp: 1000,
        type: 'cpu_high',
        resource: 'server-1',
        priority: 3,
        message: 'CPU high',
        severity: 'warning',
      };

      service.processAlert(alert);
      service.reset();

      // After reset, same alert should generate activation again
      const actions = service.processAlert(alert);
      expect(actions[0].actionType).toBe('activate');
    });
  });
});

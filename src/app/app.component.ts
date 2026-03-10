import { Component, OnInit } from '@angular/core';
import { AlertDeduplicationService } from './services/alert-deduplication.service';
import { AlertEvent, ActionEvent } from './models/alert.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'Alert De-duplication & Throttling Service';
  alerts: AlertEvent[] = [];
  actions: ActionEvent[] = [];
  isTestRunning = false;

  constructor(private alertService: AlertDeduplicationService) {}

  ngOnInit(): void {
    this.runDemo();
  }

  /**
   * Run a demonstration of the service
   */
  runDemo(): void {
    this.isTestRunning = true;
    const baseTime = new Date('2026-03-10T04:00:00Z').getTime();
    this.alerts = [
      {
        id: 'alert-1',
        source: 'server-1',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: new Date(baseTime).toISOString(),
        message: 'CPU usage exceeds 80%',
      },
      {
        id: 'alert-2',
        source: 'server-1',
        fingerprint: 'cpu-high',
        severity: 'P2',
        timestamp: new Date(baseTime + 2000).toISOString(),
        message: 'CPU usage exceeds 85%',
      },
      {
        id: 'alert-3',
        source: 'server-1',
        fingerprint: 'memory-high',
        severity: 'P3',
        timestamp: new Date(baseTime + 3000).toISOString(),
        message: 'Memory usage exceeds 90%',
      },
      {
        id: 'alert-4',
        source: 'server-2',
        fingerprint: 'disk-full',
        severity: 'P1',
        timestamp: new Date(baseTime + 4000).toISOString(),
        message: 'Disk is critically full',
      },
      {
        id: 'alert-5',
        source: 'server-2',
        fingerprint: 'disk-full',
        severity: 'P1',
        timestamp: new Date(baseTime + 5000).toISOString(),
        message: 'Disk is still critically full',
      }
    ];

    this.actions = this.alertService.processAlerts(this.alerts);
    this.isTestRunning = false;
  }

  /**
   * Get action color for UI
   */
  getActionColor(action: string): string {
    switch (action) {
      case 'emit_incident':
        return 'accent';
      case 'emit_update':
        return 'warning';
      case 'emit_resolve':
        return 'success';
      case 'suppress':
        return 'secondary';
      default:
        return '';
    }
  }

  /**
   * Clear all data
   */
  clearData(): void {
    this.alertService.reset();
    this.alerts = [];
    this.actions = [];
  }
}

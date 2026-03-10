import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { AlertDeduplicationService } from './services/alert-deduplication.service';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let service: AlertDeduplicationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AppComponent ],
      providers: [ AlertDeduplicationService ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(AlertDeduplicationService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have correct title', () => {
    expect(component.title).toBe('Alert De-duplication & Throttling Service');
  });

  it('should run demo successfully', () => {
    component.runDemo();
    expect(component.isTestRunning).toBe(false);
    expect(component.alerts.length).toBeGreaterThan(0);
    expect(component.actions.length).toBeGreaterThan(0);
  });

  it('should clear data', () => {
    component.runDemo();
    expect(component.alerts.length).toBeGreaterThan(0);
    
    component.clearData();
    expect(component.alerts.length).toBe(0);
    expect(component.actions.length).toBe(0);
  });

  it('should return correct color for action type', () => {
    expect(component.getActionColor('emit_incident')).toBe('accent');
    expect(component.getActionColor('emit_update')).toBe('warning');
    expect(component.getActionColor('emit_resolve')).toBe('success');
    expect(component.getActionColor('suppress')).toBe('secondary');
    expect(component.getActionColor('unknown')).toBe('');
  });

  it('should have demo alerts with correct properties', () => {
    component.runDemo();
    
    const alert = component.alerts[0];
    expect(alert.id).toBeTruthy();
    expect(alert.timestamp).toBeTruthy();
    expect(alert.fingerprint).toBeTruthy();
    expect(alert.source).toBeTruthy();
    expect(alert.message).toBeTruthy();
    expect(['P1', 'P2', 'P3']).toContain(alert.severity);
  });

  it('should generate valid actions from demo alerts', () => {
    component.runDemo();
    
    component.actions.forEach(action => {
      expect(['emit_incident', 'emit_update', 'emit_resolve', 'suppress']).toContain(action.action);
      expect(['new', 'update', 'escalated', 'quiet_resolve', 'throttle']).toContain(action.reason);
      expect(action.incident_id).toBeTruthy();
      expect(action.incident_id.startsWith('inc-')).toBe(true);
      expect(['P1', 'P2', 'P3']).toContain(action.severity);
    });
  });
});

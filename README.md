# Alert De-duplication & Throttling Service

A comprehensive Angular service for transforming a time-ordered stream of monitoring alert events into action events for an incident system. This service implements deduplication, throttling, escalation, priority exceptions, idempotency, and quiet auto-resolution.

## Features

### 1. **Deduplication**
- Groups identical alerts by alert type and resource
- Alerts within a configurable deduplication window are considered duplicates
- Prevents duplicate action events from being generated

### 2. **Throttling**
- Limits the number of escalation actions per alert group within a throttle window
- Prevents alert fatigue by constraining repeated escalations
- Configurable maximum escalations per throttle window

### 3. **Escalation**
- Promotes duplicate alerts to escalation actions
- Tracks and preserves the maximum priority seen in an alert group
- Escalation count is reset after the throttle window expires

### 4. **Priority Exceptions**
- High-priority alerts (above a configurable threshold) bypass throttling
- Critical alerts are always escalated regardless of throttle limits
- Default threshold: Priority 4 and above

### 5. **Idempotency**
- Generates deterministic idempotency keys for each action
- Ensures at-most-once delivery of actions
- Prevents duplicate processing of the same alert

### 6. **Quiet Auto-Resolution**
- Low-priority alerts are automatically resolved after a timeout without escalation
- Prevents unnecessary incident creation for minor alerts
- Only applies to alerts below the priority exception threshold

## Architecture

### Files Structure
```
src/app/
├── models/
│   └── alert.model.ts           # Type definitions and interfaces
├── services/
│   ├── alert-deduplication.service.ts      # Core service implementation
│   └── alert-deduplication.service.spec.ts # Unit tests
└── README.md                     # This file
```

### Key Interfaces

#### AlertEvent
```typescript
interface AlertEvent {
  id: string;                    // Unique identifier
  timestamp: number;             // Milliseconds since epoch
  type: string;                  // Alert type (e.g., "cpu_high", "disk_full")
  resource: string;              // Resource identifier (e.g., "server-1")
  priority: number;              // 1 (low) to 5 (critical)
  message: string;               // Alert description
  severity: "info" | "warning" | "error" | "critical";
  metadata?: Record<string, any>; // Optional custom data
}
```

#### ActionEvent
```typescript
interface ActionEvent {
  id: string;                    // Unique action ID
  timestamp: number;             // When the action was generated
  alertGroupKey: string;         // Reference to alert group (type|resource)
  actionType: "activate" | "escalate" | "resolve"; // Action type
  priority: number;              // Current/max priority of alert group
  alertType: string;             // Source alert type
  resource: string;              // Affected resource
  description: string;           // Human-readable description
  idempotencyKey: string;        // For ensuring at-most-once delivery
  isQuietResolution: boolean;    // Whether this was auto-resolved
}
```

#### ThrottleConfig
```typescript
interface ThrottleConfig {
  deduplicationWindow: number;          // Default: 5000ms
  maxEscalationsPerWindow: number;      // Default: 3
  throttleWindow: number;               // Default: 30000ms
  quietResolutionTimeout: number;       // Default: 300000ms
  priorityExceptionThreshold: number;   // Default: 4
}
```

## Usage

### Basic Setup

```typescript
import { AlertDeduplicationService } from './services/alert-deduplication.service';
import { AlertEvent } from './models/alert.model';

// Inject the service
constructor(private alertService: AlertDeduplicationService) {}

// Process a single alert
const alert: AlertEvent = {
  id: 'alert-001',
  timestamp: Date.now(),
  type: 'cpu_high',
  resource: 'server-1',
  priority: 3,
  message: 'CPU usage exceeds 90%',
  severity: 'warning'
};

const actions = this.alertService.processAlert(alert);
```

### Process Multiple Alerts

```typescript
const alerts: AlertEvent[] = [
  // ... multiple alert events
];

const allActions = this.alertService.processAlerts(alerts);
```

### Custom Configuration

```typescript
// Configure throttling behavior
this.alertService.setConfig({
  deduplicationWindow: 10000,        // 10 seconds
  maxEscalationsPerWindow: 5,
  throttleWindow: 60000,             // 1 minute
  quietResolutionTimeout: 600000,    // 10 minutes
  priorityExceptionThreshold: 4
});
```

### Testing & Debugging

```typescript
// Get state of a specific alert group
const groupState = this.alertService.getGroupState('cpu_high', 'server-1');

// Clear all state (useful in tests)
this.alertService.reset();
```

## Processing Rules

### Action Generation Rules

1. **New Alert** (priority ≤ threshold):
   - Generates `activate` action if not a duplicate
   - Sets group as activated

2. **Duplicate Alert** (same type + resource, within dedup window):
   - Generates `escalate` action if throttle limits allow
   - High-priority alerts bypass throttle limits

3. **Auto-Resolution**:
   - Generates `resolve` action if:
     - Low-priority alert (below priority exception threshold)
     - Timeout has passed since activation
     - Marked as `isQuietResolution: true`

### Processing Flow

```
Incoming Alert
    ↓
Get/Create Alert Group (type + resource)
    ↓
Check if Duplicate?
    ├─ YES
    │   ↓
    │   Should Escalate? (check throttle + priority)
    │   ├─ YES → Generate escalation action
    │   └─ NO → Skip
    │
    └─ NO
        ↓
        Generate activation action
        ↓
        Should Auto-Resolve? (low priority + timeout)
        ├─ YES → Generate resolution action
        └─ NO → Done

Output: Array of Action Events
```

## Running Tests

### Prerequisites
- Node.js 14+ and npm
- Angular CLI installed globally: `npm install -g @angular/cli`

### Setup

```bash
# Install dependencies
npm install

# Run unit tests
ng test

# Run tests with code coverage
ng test --code-coverage

# Run tests once and exit
ng test --watch=false
```

### Test Coverage

The test suite includes:

- **Deduplication Tests** (5 tests)
  - Alert grouping by type and resource
  - Deduplication window behavior
  - Separate groups for different types/resources

- **Throttling Tests** (4 tests)
  - Escalation throttling
  - Max escalations per window
  - Throttle window reset
  - High-priority exception

- **Priority Exception Tests** (1 test)
  - Bypassing throttle for critical alerts

- **Escalation Tests** (2 tests)
  - Duplicate alert escalation
  - Priority preservation in escalations

- **Quiet Auto-Resolution Tests** (2 tests)
  - Auto-resolution after timeout
  - Preventing auto-resolution of high-priority

- **Idempotency Tests** (3 tests)
  - Duplicate action prevention
  - Unique idempotency keys
  - Consistent key generation

- **Integration Tests** (2 tests)
  - Complex alert streams
  - Multiple independent groups

- **Edge Cases** (5 tests)
  - Empty streams
  - Single alerts
  - Same timestamps
  - Priority handling

- **Configuration Tests** (2 tests)
  - Custom configuration
  - Service reset

**Total: 26 test cases**

## Example Scenarios

### Scenario 1: CPU Alert Escalation
```
T=0s:   New CPU high alert on server-1, priority 2 → ACTIVATE
T=2s:   Duplicate CPU alert on server-1 → ESCALATE
T=4s:   Duplicate CPU alert on server-1 → ESCALATE
T=8s:   Duplicate CPU alert on server-1 → THROTTLED (max escalations reached)
T=35s:  New CPU alert (outside dedup window) → ACTIVATE
```

### Scenario 2: Critical Alert (Priority Exception)
```
T=0s:   Network down alert, priority 5 → ACTIVATE
T=1s:   Network still down, priority 5 → ESCALATE (bypasses throttle)
T=2s:   Network still down, priority 5 → ESCALATE (bypasses throttle)
T=3s:   Network still down, priority 5 → ESCALATE (bypasses throttle)
```

### Scenario 3: Low-Priority Auto-Resolution
```
T=0s:    Disk usage 85%, priority 2 → ACTIVATE
T=2s:    Disk usage 87%, priority 2 → ESCALATE
T=5min:  Disk usage normal, priority 2 → RESOLVE (quiet auto-resolution)
```

## Configuration Recommendations

### For High-Volume Systems
```typescript
service.setConfig({
  deduplicationWindow: 10000,        // 10 seconds
  maxEscalationsPerWindow: 2,        // Limit escalations
  throttleWindow: 60000,             // 1 minute
  quietResolutionTimeout: 600000,    // 10 minutes
  priorityExceptionThreshold: 4
});
```

### For Real-time Monitoring
```typescript
service.setConfig({
  deduplicationWindow: 2000,         // 2 seconds
  maxEscalationsPerWindow: 5,
  throttleWindow: 15000,             // 15 seconds
  quietResolutionTimeout: 120000,    // 2 minutes
  priorityExceptionThreshold: 3      // Lower threshold
});
```

## Dependencies

- Angular 12+
- TypeScript 4.3+

## License

MIT

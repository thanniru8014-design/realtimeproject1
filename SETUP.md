# Setup & Installation Guide

## Quick Start

### Prerequisites
- Node.js 14.20+ or 16+
- npm 6.14+
- Angular CLI 16+ (install globally: `npm install -g @angular/cli`)

### Installation Steps

1. **Navigate to the project directory:**
   ```bash
   cd /Users/thannirusaithulasi/realtimeproject1/realtimeproject1
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run unit tests:**
   ```bash
   ng test
   ```
   
   This will launch the Karma test runner with Chrome and display the test results in a browser window.

4. **Run tests once (CI mode):**
   ```bash
   ng test --watch=false
   ```

5. **Run tests with code coverage:**
   ```bash
   ng test --code-coverage --watch=false
   ```
   
   Coverage reports will be generated in the `coverage/` directory.

6. **Start the development server (optional):**
   ```bash
   ng serve
   ```
   
   Navigate to `http://localhost:4200/` to see the demo application.

## Project Structure

```
realtimeproject1/
├── src/
│   ├── app/
│   │   ├── models/
│   │   │   └── alert.model.ts           # Type definitions
│   │   ├── services/
│   │   │   ├── alert-deduplication.service.ts
│   │   │   └── alert-deduplication.service.spec.ts  # Unit tests
│   │   ├── app.component.ts             # Main component
│   │   ├── app.component.html
│   │   ├── app.component.scss
│   │   ├── app.component.spec.ts
│   │   └── app.module.ts
│   ├── main.ts                          # Bootstrap
│   ├── styles.scss                      # Global styles
│   └── index.html                       # HTML template
├── angular.json                         # Angular CLI config
├── karma.conf.js                        # Test runner config
├── tsconfig.json                        # TypeScript config
├── package.json                         # Dependencies
├── .gitignore
├── README.md                            # Main documentation
└── SETUP.md                             # This file
```

## Running the Tests

### Test Execution

The project includes comprehensive unit tests covering:

**26 Test Cases across 9 Test Suites:**
1. ✅ Deduplication (5 tests)
2. ✅ Throttling (4 tests)  
3. ✅ Priority Exceptions (1 test)
4. ✅ Escalation (2 tests)
5. ✅ Quiet Auto-Resolution (2 tests)
6. ✅ Idempotency (3 tests)
7. ✅ Integration Tests (2 tests)
8. ✅ Edge Cases (5 tests)
9. ✅ Service Configuration (2 tests)

### Running Tests

```bash
# Run tests in watch mode
ng test

# Run tests once
ng test --watch=false

# Run with coverage
ng test --code-coverage --watch=false --browsers Chrome

# Run specific test file
ng test --include='**/alert-deduplication.service.spec.ts'

# Run with detailed output
ng test --reporters=junit
```

### Expected Test Output

All tests should pass with output similar to:

```
Chrome X.X.X (OS X 10.X.X): Executed 26 of 26 SUCCESS (X.XXX secs / X.XXX secs)

TOTAL: 26 SUCCESS
```

## Service Usage Examples

### Basic Usage

```typescript
import { AlertDeduplicationService } from './services/alert-deduplication.service';
import { AlertEvent } from './models/alert.model';

constructor(private alertService: AlertDeduplicationService) {}

// Process an alert
const alert: AlertEvent = {
  id: 'alert-1',
  timestamp: Date.now(),
  type: 'cpu_high',
  resource: 'server-1',
  priority: 3,
  message: 'CPU usage high',
  severity: 'warning'
};

const actions = this.alertService.processAlert(alert);
```

### Batch Processing

```typescript
const alerts: AlertEvent[] = [
  // ... array of alerts
];

const actions = this.alertService.processAlerts(alerts);
```

### Custom Configuration

```typescript
this.alertService.setConfig({
  deduplicationWindow: 10000,    // 10 seconds
  maxEscalationsPerWindow: 5,
  throttleWindow: 60000,         // 1 minute
  quietResolutionTimeout: 600000, // 10 minutes  
  priorityExceptionThreshold: 4
});
```

## Troubleshooting

### Issue: Tests fail with "Chrome not found"
**Solution:** Install Chrome or use Firefox with `--browsers Firefox`

### Issue: Module not found errors
**Solution:** Run `npm install` to ensure all dependencies are installed

### Issue: Port 4200 already in use
**Solution:** Use a different port: `ng serve --port 4201`

### Issue: Tests hang or timeout
**Solution:** Increase timeout in karma.conf.js or disable watch mode: `ng test --watch=false`

## Code Coverage

After running tests with coverage flag, view the reports:

```bash
# View coverage report in browser
open coverage/alert-deduplication-service/index.html
```

Expected coverage metrics:
- Statements: >95%
- Branches: >90%
- Functions: >95%
- Lines: >95%

## Development Server

To run the development server with live reload:

```bash
ng serve
```

Then open `http://localhost:4200/` in your browser.

## Building for Production

```bash
ng build --configuration production
```

Output will be in the `dist/` directory.

## Additional Commands

```bash
# Lint the code
ng lint

# Format code
ng lint --fix

# Build library
ng build alert-deduplication-service

# Generate component
ng generate component components/alert-display

# Generate service
ng generate service services/my-new-service
```

## Resources

- [Angular Documentation](https://angular.io/docs)
- [Karma Test Runner](https://karma-runner.github.io/)
- [Jasmine Testing Framework](https://jasmine.github.io/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## Support

For issues or questions about the Alert De-duplication & Throttling Service, refer to:
1. Main README.md for service documentation
2. Service inline comments for implementation details
3. Test file (alert-deduplication.service.spec.ts) for usage examples

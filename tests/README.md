# Test Suite Documentation

## Overview

This directory contains the comprehensive test suite for **Open Claude Cowork**, including unit tests, integration tests, and end-to-end smoke tests using Playwright.

## Directory Structure

```
tests/
├── smoke.spec.js           # Playwright E2E smoke tests (36 tests)
├── SMOKE_TESTS.md          # Comprehensive smoke test documentation
├── README.md               # This file
├── fixtures/               # Test fixtures and sample data
├── helpers/                # Test utility functions
├── integration/            # Integration tests
│   └── server/            # Server integration tests
├── mocks/                  # API mocks and test doubles
├── setup/                  # Test setup and configuration
└── unit/                   # Unit tests
    ├── electron/          # Electron-specific unit tests
    ├── renderer/          # Frontend unit tests
    └── server/            # Backend unit tests
```

## Test Categories

### 1. Smoke Tests (E2E) - 36 tests
**File**: `smoke.spec.js`
**Framework**: Playwright
**Purpose**: Verify critical application functionality across browsers

**Coverage**:
- Core application functionality (including provider/model controls, navigation, and primary interactions)
- Responsive design (3 tests)
- Accessibility (3 tests)
- Error handling (2 tests)
- Performance (2 tests)

**Run**:
```bash
npm run test:smoke              # Run smoke tests
npm run test:e2e:ui            # Interactive UI mode
npm run test:e2e:headed        # Watch browser execution
npm run test:e2e:debug         # Debug mode with breakpoints
```

### 2. Unit Tests
**Framework**: Vitest
**Purpose**: Test individual components and functions in isolation

**Run**:
```bash
npm test                       # Run all unit tests once
npm run test:watch            # Watch mode
npm run test:coverage         # With coverage report
npm run test:server           # Server tests only
npm run test:renderer         # Frontend tests only
```

### 3. Integration Tests
**Framework**: Vitest + Supertest
**Purpose**: Test component interactions and API endpoints

**Run**:
```bash
npm run test:server           # Includes integration tests
```

## Quick Start

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers (for E2E tests):
   ```bash
   npx playwright install
   ```

### Running Tests

```bash
# Run everything
npm test                    # All unit/integration tests
npm run test:e2e           # All E2E tests

# Run specific suites
npm run test:smoke         # Smoke tests only
npm run test:smoke:deployed # Deployment smoke check for live URL
npm run test:server        # Server tests only
npm run test:renderer      # Frontend tests only

# Development
npm run test:watch         # Unit tests in watch mode
npm run test:e2e:ui        # E2E tests with UI
```

## Test Configuration

### Vitest (Unit/Integration)
**Config**: `vitest.config.js` (root)

```javascript
{
  environment: 'happy-dom',    // DOM simulation
  coverage: {
    provider: 'v8',
    include: ['server/**/*.js', 'renderer/**/*.js'],
    exclude: ['**/node_modules/**', '**/tests/**']
  }
}
```

### Playwright (E2E)
**Config**: `playwright.config.js`

```javascript
{
  testDir: './tests',
  timeout: 30000,
  retries: 2,                  // On CI only
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },
  projects: [
    'chromium', 'firefox', 'webkit',
    'Mobile Chrome', 'Mobile Safari'
  ]
}
```

## Writing Tests

### Unit Test Example

```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myModule.js';

describe('myFunction', () => {
  it('should return expected value', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### E2E Test Example

```javascript
import { test, expect } from '@playwright/test';

test('feature description', async ({ page }) => {
  await page.goto('/');

  const button = page.locator('#myButton');
  await button.click();

  await expect(page.locator('.result')).toBeVisible();
});
```

### Integration Test Example

```javascript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('POST /api/endpoint', () => {
  it('should return success', async () => {
    const response = await request(app)
      .post('/api/endpoint')
      .send({ data: 'test' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test

  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:smoke
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: |
            playwright-report/
            test-results/
```

## Test Reports

### Unit Test Reports (Vitest)

Reports are shown in the terminal. For coverage:
```bash
npm run test:coverage
# Opens coverage/index.html
```

### E2E Test Reports (Playwright)

After tests complete:
```bash
npx playwright show-report
```

Or check these directories:
- `playwright-report/` - HTML report
- `test-results/` - Screenshots, videos, traces

## Troubleshooting

### Common Issues

#### 1. "Port 3001 already in use"
**Solution**: The webServer in `playwright.config.js` automatically starts the server. Ensure no other instance is running.

#### 2. "Element not visible" errors
**Solution**: Use Playwright's auto-waiting:
```javascript
await expect(element).toBeVisible();
await element.click();
```

#### 3. Tests timeout
**Solution**: Increase timeout for slow operations:
```javascript
await expect(element).toBeVisible({ timeout: 10000 });
```

#### 4. Tests fail on CI but pass locally
**Solution**:
- Check CI environment has required dependencies
- Use retries in config for flaky tests
- Review CI logs and artifacts

### Debugging

#### Debug E2E tests:
```bash
npm run test:e2e:debug
# Opens Playwright Inspector
```

#### Debug unit tests:
```bash
npm run test:watch
# Use debugger; statements in code
```

#### View test traces:
```bash
npx playwright show-trace test-results/trace.zip
```

## Best Practices

### General
1. ✅ Write tests for new features
2. ✅ Keep tests independent and isolated
3. ✅ Use descriptive test names
4. ✅ Follow the Arrange-Act-Assert pattern
5. ✅ Mock external dependencies

### E2E Tests
1. ✅ Use stable selectors (IDs preferred)
2. ✅ Let Playwright auto-wait
3. ✅ Test user flows, not implementation
4. ✅ Keep tests fast and focused
5. ✅ Handle conditional states gracefully

### Unit Tests
1. ✅ Test one thing per test
2. ✅ Use meaningful assertions
3. ✅ Mock side effects
4. ✅ Test edge cases
5. ✅ Keep tests simple

## Coverage Goals

### Current Coverage
- ✅ Core UI elements
- ✅ Navigation and routing
- ✅ Provider/model selection
- ✅ Settings functionality
- ✅ Responsive design
- ✅ Accessibility basics
- ✅ Error handling

### Future Coverage
- ⬜ Complete message sending flow
- ⬜ Tool call execution
- ⬜ File upload/download
- ⬜ Authentication flows
- ⬜ Database operations
- ⬜ Real-time features (SSE)
- ⬜ MCP server integration

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Playwright Documentation](https://playwright.dev)
- [Testing Best Practices](https://playwright.dev/docs/best-practices)
- [Project README](../README.md)
- [Smoke Tests Guide](./SMOKE_TESTS.md)

## Contributing

When adding tests:

1. Follow existing patterns and conventions
2. Update this documentation
3. Ensure tests pass locally before committing
4. Add appropriate comments for complex logic
5. Keep test files organized by feature/component

## Support

For issues or questions:
- Check existing tests for examples
- Review test documentation
- Check console output for errors
- Use debug mode to step through tests

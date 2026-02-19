# Smoke Tests

This directory contains Playwright-based end-to-end smoke tests for Open Claude Cowork.

## What are Smoke Tests?

Smoke tests are a subset of test cases that cover the most critical functionality of the application. They are designed to quickly verify that the core features work correctly after a build or deployment. Think of them as a "sanity check" before running more comprehensive test suites.

## Test Coverage

The smoke test suite (`smoke.spec.js`) currently covers **36 tests** organized into **5 suites**:

### Core Functionality
- ✅ Application loads successfully with proper title and main container
- ✅ Home view displays greeting and tagline
- ✅ Chat interface elements (message input, send button, attach, vault, thinking buttons)
- ✅ Provider and model dropdown menus (Claude, Opus, Sonnet, Haiku)
- ✅ API endpoint dependency health checks for jobs/reports/chats/vault
- ✅ Settings panel navigation (open and back)
- ✅ Message input handling and send button state management
- ✅ Left sidebar with all navigation buttons
- ✅ Sidebar collapse/expand functionality
- ✅ View navigation (Reports, Jobs, Vault)
- ✅ Authentication UI (skip option, form elements)
- ✅ File attachment button functionality
- ✅ Thinking mode toggle
- ✅ Backend banner for connection issues
- ✅ Required script libraries (marked, DOMPurify, Chart.js)
- ✅ HTML meta tags and CSS loading

### Responsive Design Tests (3 tests)
- ✅ Mobile viewport (375×667)
- ✅ Tablet viewport (768×1024)
- ✅ Desktop viewport (1920×1080)

### Accessibility Tests (3 tests)
- ✅ Form controls with labels and placeholders
- ✅ Keyboard navigation support
- ✅ Proper ARIA attributes and semantic HTML

### Error Handling Tests (2 tests)
- ✅ Network error graceful degradation
- ✅ JavaScript error monitoring

### Performance Tests (2 tests)
- ✅ Page load time (under 5 seconds)
- ✅ Rapid input change handling

## Setup

1. **Install Playwright:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

3. **Ensure the server is ready:**
   The tests expect the app to be running at `http://localhost:3001` (configurable via `BASE_URL` environment variable).

## Running the Tests

### Run all smoke tests:
```bash
npm run test:smoke
```

### Deployment smoke check

Use this lightweight check for deployed environments:

```bash
DEPLOY_SMOKE_URL=https://your-deployment.example.com npm run test:smoke:deployed
```

It validates:

- Homepage loads
- `GET /api/health`, `GET /api/config`
- Supabase anon key health against `/auth/v1/health`
- Protected API routes return auth-gated `401` responses where expected

**Optional — sign in and create a workflow:** To test the full flow (auth + create job) on a deployed URL, create a Supabase test user with `scripts/create-test-user.js` (requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`), then run:

```bash
BASE_URL=https://your-deployment.example.com TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run test:e2e:workflow
```

See `SETUP_AND_DEPLOY.md` (§ Test user and E2E workflow) for details.

### Run all E2E tests (including smoke):
```bash
npm run test:e2e
```

### Run with UI mode (interactive):
```bash
npm run test:e2e:ui
```

### Run in headed mode (see browser):
```bash
npm run test:e2e:headed
```

### Debug mode (step through tests):
```bash
npm run test:e2e:debug
```

### Run against a different URL:
```bash
BASE_URL=http://localhost:8080 npm run test:smoke
```

## Test Configuration

The tests are configured via `playwright.config.js`:

- **Browsers:** Chromium, Firefox, WebKit (Safari)
- **Mobile:** Pixel 5, iPhone 12
- **Timeouts:** 30s per test, 5s per assertion
- **Retries:** 2 retries on CI, 0 locally
- **Artifacts:** Screenshots and videos on failure, traces on retry

## Test Structure

Each test follows this pattern:

```javascript
test('descriptive test name', async ({ page }) => {
  // 1. Setup (navigate, prepare state)
  await page.goto(BASE_URL);

  // 2. Action (interact with UI)
  const button = page.locator('button:has-text("Click me")');
  await button.click();

  // 3. Assert (verify expected outcome)
  await expect(page.locator('.success')).toBeVisible();
});
```

## Continuous Integration

The smoke tests are designed to run in CI environments:

- **Fast execution:** Typically complete in 2-3 minutes
- **Failure isolation:** Tests are independent and can run in parallel
- **CI-friendly:** Automatic retries, no flakiness from hardcoded waits
- **Artifacts:** Screenshots/videos/traces available for debugging failures

### Example GitHub Actions workflow:

```yaml
name: Smoke Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:smoke
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Writing New Tests

When adding new smoke tests:

1. **Focus on critical paths:** Only test features that would break the core user experience
2. **Keep them fast:** Each test should complete in under 10 seconds
3. **Make them reliable:** Avoid hardcoded timeouts, use Playwright's auto-waiting
4. **Test user flows:** Think about what real users do, not implementation details

### Example:

```javascript
test('user can send a message and see response', async ({ page }) => {
  await page.goto(BASE_URL);

  // Type a message
  const input = page.locator('textarea[placeholder*="message"]');
  await input.fill('Hello');

  // Send it
  const sendButton = page.locator('button:has-text("Send")');
  await sendButton.click();

  // Verify response appears
  await expect(page.locator('.message.assistant')).toBeVisible({ timeout: 10000 });
});
```

## Troubleshooting

### Tests fail with "Timeout" errors
- Ensure the server is running at the expected URL
- Check if the selectors match your UI (they may need updating)
- Increase timeout if the app is legitimately slow: `{ timeout: 60000 }`

### Tests fail with "Element not found"
- Check if the UI structure changed
- Update selectors in the test to match current implementation
- Use Playwright Inspector to debug: `npm run test:e2e:debug`

### Tests are flaky (sometimes pass, sometimes fail)
- Avoid `page.waitForTimeout()` - use auto-waiting instead
- Ensure actions are complete before making assertions
- Check for race conditions in the app (not the tests)

## Best Practices

1. **Use semantic selectors:** Prefer `page.locator('button:has-text("Send")')` over `.locator('.btn-123')`
2. **Test user-visible behavior:** Don't test implementation details
3. **Keep tests independent:** Each test should work in isolation
4. **Use Page Object Model** (for complex flows): Encapsulate UI interactions in reusable functions
5. **Document test intent:** Use clear test names and add comments for complex logic

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)

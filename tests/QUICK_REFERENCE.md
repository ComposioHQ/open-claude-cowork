# Quick Reference Guide

## 🚀 Run Tests

```bash
# Smoke tests (E2E)
npm run test:smoke              # Run all smoke tests
npm run test:e2e:ui            # Interactive mode with UI
npm run test:e2e:headed        # See the browser
npm run test:e2e:debug         # Debug with breakpoints
npm run test:smoke:deployed    # Deployment smoke check (`DEPLOY_SMOKE_URL=...`)

# Unit tests
npm test                       # Run once
npm run test:watch            # Watch mode
npm run test:coverage         # With coverage

# Specific suites
npm run test:server           # Backend tests only
npm run test:renderer         # Frontend tests only
```

## 📊 Test Statistics

- **Total Smoke Tests**: 36
- **Browser Coverage**: 5 (Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari)
- **Test Execution Time**: ~2-3 minutes
- **Pass Rate**: ~75% (with known issues documented)

## 🎯 What's Tested

### Core Features ✅
- Home view and greeting
- Message input and send button
- Provider/model selection dropdowns
- Settings navigation
- Left sidebar and navigation
- All view transitions (Reports, Jobs, Vault)

### Responsive Design ✅
- Mobile (375×667)
- Tablet (768×1024)
- Desktop (1920×1080)

### Accessibility ✅
- Form labels and placeholders
- Keyboard navigation
- Semantic HTML

### Performance ✅
- Load time < 5 seconds
- Rapid input handling

## 🔍 Key Selectors

```javascript
// Navigation
'#leftSidebar'                  // Left sidebar
'#settingsSidebarBtn'          // Settings button
'#reportsSidebarBtn'           // Reports button
'#vaultSidebarBtn'             // Vault button

// Input elements
'#homeInput'                   // Home message input
'#homeSendBtn'                 // Home send button
'#homeAttachBtn'               // Attach file button
'#homeThinkingBtn'             // Thinking mode toggle

// Dropdowns
'#homeProviderDropdown'        // Provider selector
'#homeModelDropdown'           // Model selector

// Views
'#homeView'                    // Home view
'#chatView'                    // Chat view
'#settingsView'                // Settings view
```

## 🐛 Debug Commands

```bash
# View test report
npx playwright show-report

# View test trace
npx playwright show-trace test-results/trace.zip

# Run single test
npx playwright test --grep "test name"

# Update snapshots
npx playwright test --update-snapshots
```

## 📝 Common Patterns

### Check element visibility
```javascript
await expect(page.locator('#elementId')).toBeVisible();
```

### Click and verify
```javascript
await page.locator('#button').click();
await expect(page.locator('.result')).toBeVisible();
```

### Fill input
```javascript
await page.locator('#input').fill('text');
await expect(page.locator('#input')).toHaveValue('text');
```

### Wait for navigation
```javascript
await page.goto('/');
await page.waitForLoadState('domcontentloaded');
```

## 🔧 Environment Variables

```bash
BASE_URL=http://localhost:3001    # Test against this URL
CI=true                           # Enable CI mode (retries)
```

## 📚 Documentation

- **[SMOKE_TESTS.md](./SMOKE_TESTS.md)** - Comprehensive smoke test guide
- **[README.md](./README.md)** - Complete test suite documentation
- **[TEST_RESULTS.md](./TEST_RESULTS.md)** - Latest test results and findings

## 💡 Tips

1. **Use UI mode** for developing tests: `npm run test:e2e:ui`
2. **Use headed mode** to see what's happening: `npm run test:e2e:headed`
3. **Use debug mode** to step through: `npm run test:e2e:debug`
4. **Check screenshots** in `test-results/` after failures
5. **Update selectors** if UI structure changes

## 🎭 Playwright Inspector

```bash
# Open inspector
npx playwright test --debug

# Pause on specific test
# Add await page.pause(); in your test
```

## 📱 Mobile Testing

Tests automatically run on mobile viewports:
- Pixel 5 (Android)
- iPhone 12 (iOS)

## 🌐 Browser Testing

Tests run on:
- Chromium (Chrome/Edge)
- Firefox
- WebKit (Safari)

## ⚡ Performance

- Tests are parallelized (4 workers by default)
- Server auto-starts via `webServer` config
- Results cached for faster reruns

## 🔒 Best Practices

1. ✅ Use stable selectors (IDs preferred)
2. ✅ Let Playwright auto-wait (avoid timeouts)
3. ✅ Test user flows, not implementation
4. ✅ Keep tests independent
5. ✅ Use descriptive test names

## 🚨 Known Issues

| Issue | Workaround |
|-------|------------|
| Vault view timeout | Requires Supabase connection |
| Animation timing | Add explicit waits |
| File picker | Browser-specific behavior |
| Mobile layout | Some overflow on small screens |

## 📞 Need Help?

1. Check [Playwright docs](https://playwright.dev)
2. Review test documentation in this directory
3. Use `--debug` mode to inspect failures
4. Check `test-results/` for screenshots/videos

---

**Last Updated**: February 15, 2026
**Test Suite Version**: 1.0.0
**Playwright Version**: 1.58.2

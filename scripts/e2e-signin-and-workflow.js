#!/usr/bin/env node
/**
 * Sign in to the deployed app with test credentials and create a workflow (job).
 * Uses BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD from env.
 * No local server is started; run against deployed URL.
 *
 * Usage:
 *   BASE_URL=https://cowork.ignitabull.org TEST_USER_EMAIL=autotest+e2e@coworktest.local TEST_USER_PASSWORD='TestPassword123!' node scripts/e2e-signin-and-workflow.js
 */
const { chromium } = require('playwright');

const BASE_URL = (process.env.BASE_URL || 'https://cowork.ignitabull.org').replace(/\/$/, '');
const EMAIL = process.env.TEST_USER_EMAIL || 'autotest+e2e@coworktest.local';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';
const WORKFLOW_NAME = process.env.WORKFLOW_NAME || 'E2E test workflow';
const WORKFLOW_DESCRIPTION = process.env.WORKFLOW_DESCRIPTION || 'Created by e2e-signin-and-workflow.js';
const ACTION_TYPE = process.env.WORKFLOW_ACTION_TYPE || 'chat_message';
const CHAT_PROMPT = process.env.WORKFLOW_CHAT_PROMPT || 'Say hello once.';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 10000 });

    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPassword').fill(PASSWORD);
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('supabase.co'), { timeout: 15000 }).catch(() => null),
      page.locator('#authSubmitBtn').click()
    ]);
    await page.waitForTimeout(2000);
    const authErrorText = await page.locator('#authError').textContent().catch(() => '');
    if (authErrorText && authErrorText.trim()) {
      console.error('Sign-in error:', authErrorText.trim());
      await page.screenshot({ path: 'output/e2e-workflow-signin-error.png' });
      process.exit(1);
    }
    await page.waitForSelector('#jobsSidebarBtn', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);

    const jobsBtn = page.locator('#jobsSidebarBtn');
    await jobsBtn.click();
    await page.waitForTimeout(500);

    const newWorkflowBtn = page.locator('#jobsNewBtn');
    await newWorkflowBtn.click();
    await page.waitForTimeout(300);

    const nameInput = page.locator('#jobName');
    await nameInput.fill(WORKFLOW_NAME);
    const descInput = page.locator('#jobDescription');
    await descInput.fill(WORKFLOW_DESCRIPTION);
    await page.selectOption('#jobActionType', ACTION_TYPE);
    await page.waitForTimeout(200);
    if (ACTION_TYPE === 'chat_message') {
      await page.locator('#jobChatMessagePrompt').fill(CHAT_PROMPT);
    }
    const [jobRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/jobs') && res.request().method() === 'POST', { timeout: 10000 }).catch(() => null),
      page.locator('#jobSaveBtn').click()
    ]);
    await page.waitForTimeout(2000);
    const toastText = await page.locator('#appErrorToast').textContent().catch(() => '');
    if (toastText && toastText.trim()) console.log('Toast:', toastText.trim());
    if (jobRes) console.log('POST /api/jobs status:', jobRes.status());
    await page.waitForTimeout(2000);
    const listText = await page.locator('#jobsList').textContent();
    const success = jobRes && jobRes.ok();

    if (success) {
      console.log('OK: Signed in and created workflow "' + WORKFLOW_NAME + '" at', BASE_URL);
    } else {
      console.log('List:', (listText || '').slice(0, 200));
      await page.screenshot({ path: 'output/e2e-workflow-result.png' }).catch(() => {});
    }
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    await page.screenshot({ path: 'output/e2e-workflow-error.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}
main();

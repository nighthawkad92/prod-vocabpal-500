#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const requiredEnv = [
  "APP_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "TEACHER_PASSCODE",
];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const config = {
  appUrl: process.env.APP_URL.trim().replace(/\/$/, ""),
  supabaseUrl: process.env.SUPABASE_URL.trim().replace(/\/$/, ""),
  anonKey: process.env.SUPABASE_ANON_KEY.trim(),
  teacherPasscode: process.env.TEACHER_PASSCODE.trim(),
  teacherName: (process.env.TEACHER_NAME ?? "QA Matrix Agent").trim(),
  qaSourceToken: (process.env.QA_SOURCE_TOKEN ?? "").trim(),
  finalizeAttempt: process.env.QA_MATRIX_FINALIZE_ATTEMPT === "true",
  caseLimit: Number(process.env.QA_MATRIX_CASE_LIMIT ?? 0),
  questionsToSubmit: Number(process.env.QA_MATRIX_QUESTIONS_TO_SUBMIT ?? 1),
};

const DEVICE_PROFILES = [
  {
    id: "desktop_1366",
    label: "Desktop 1366x900",
    context: {
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
    },
  },
  {
    id: "tablet_10_portrait",
    label: "Tablet 834x1112 Portrait",
    context: {
      viewport: { width: 834, height: 1112 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
  },
  {
    id: "tablet_10_landscape",
    label: "Tablet 1112x834 Landscape",
    context: {
      viewport: { width: 1112, height: 834 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
  },
];

const NETWORK_PROFILES = [
  {
    id: "wifi",
    label: "Stable WiFi",
    latencyMs: 25,
    downloadKbps: 9000,
    uploadKbps: 4500,
    connectionType: "wifi",
    jitterMs: 0,
    abortAudioCount: 1,
  },
  {
    id: "slow_4g",
    label: "Slow 4G",
    latencyMs: 180,
    downloadKbps: 1800,
    uploadKbps: 750,
    connectionType: "cellular4g",
    jitterMs: 100,
    abortAudioCount: 1,
  },
  {
    id: "slow_3g_spotty",
    label: "Slow 3G + spotty audio",
    latencyMs: 450,
    downloadKbps: 700,
    uploadKbps: 300,
    connectionType: "cellular3g",
    jitterMs: 220,
    abortAudioCount: 2,
  },
];

const NAV_TIMEOUT_MS = 60000;
const RESPONSE_TIMEOUT_MS = 45000;
const UI_TIMEOUT_MS = 30000;
const START_MAX_ATTEMPTS = 3;

const report = {
  runAt: new Date().toISOString(),
  status: "running",
  appUrl: config.appUrl,
  supabaseUrl: config.supabaseUrl,
  matrix: [],
  apiChecks: [],
  artifacts: {},
};

function kbpsToBytesPerSecond(kbps) {
  return Math.max(Math.floor((kbps * 1024) / 8), 1);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function addApiCheck(name, pass, details = {}) {
  report.apiChecks.push({
    name,
    pass,
    at: new Date().toISOString(),
    details,
  });
}

async function callFunction(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${config.supabaseUrl}/functions/v1/${path}`, {
    method,
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(config.qaSourceToken ? { "x-vocabpal-qa-source-token": config.qaSourceToken } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    payload,
  };
}

async function loginTeacher() {
  const result = await callFunction("teacher-login", {
    method: "POST",
    body: {
      fullName: config.teacherName,
      passcode: config.teacherPasscode,
    },
  });
  if (!result.ok || !result.payload?.token) {
    throw new Error(`teacher-login failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }
  addApiCheck("teacher-login", true, { teacherName: config.teacherName });
  return result.payload.token;
}

async function logoutTeacher(token) {
  const result = await callFunction("teacher-logout", { method: "POST", token });
  addApiCheck("teacher-logout", result.status === 200, { status: result.status });
}

async function createAllowlistSession(token, allowlist) {
  const now = Date.now();
  const result = await callFunction("teacher-windows", {
    method: "POST",
    token,
    body: {
      scope: "allowlist",
      allowlist,
      status: "in_progress",
      startAt: new Date(now - 5 * 60 * 1000).toISOString(),
      endAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    },
  });

  if (!result.ok || !result.payload?.window?.id) {
    throw new Error(`teacher-windows create failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }
  addApiCheck("teacher-session-created", true, {
    windowId: result.payload.window.id,
    status: result.payload.status,
    allowlistCount: allowlist.length,
  });
  return result.payload.window.id;
}

async function updateSessionStatus(token, windowId, status) {
  const result = await callFunction("teacher-windows", {
    method: "PATCH",
    token,
    body: { windowId, status },
  });

  addApiCheck(`teacher-session-${status}`, result.status === 200, {
    status: result.status,
    responseStatus: result.payload?.status ?? null,
  });
}

async function applyNetworkProfile(context, page, networkProfile) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: networkProfile.latencyMs,
    downloadThroughput: kbpsToBytesPerSecond(networkProfile.downloadKbps),
    uploadThroughput: kbpsToBytesPerSecond(networkProfile.uploadKbps),
    connectionType: networkProfile.connectionType,
  });
}

async function answerCurrentQuestion(page, answerValue) {
  const mcqOptions = page.locator(".option-grid .option");
  if ((await mcqOptions.count()) > 0) {
    const firstOption = mcqOptions.first();
    await firstOption.waitFor({ timeout: UI_TIMEOUT_MS });
    const alreadySelected = (await firstOption.getAttribute("aria-checked")) === "true";
    if (!alreadySelected) {
      try {
        await firstOption.click({ force: true, timeout: UI_TIMEOUT_MS });
      } catch {
        await firstOption.dispatchEvent("click");
      }
    }
    return "mcq";
  }

  const dictationInput = page.locator(".dictation-work input");
  if ((await dictationInput.count()) > 0) {
    await dictationInput.first().fill(answerValue);
    return "dictation";
  }

  throw new Error("Could not find answer control for current question");
}

async function getQuestionNumber(page) {
  const label = await page.locator("[data-testid='question-counter']").first().textContent();
  const match = /Question\s+(\d+)\s+(?:of|\/)\s+10/i.exec(label ?? "");
  if (!match) {
    throw new Error(`Could not parse question number from label: ${label ?? "(empty)"}`);
  }
  return Number(match[1]);
}

async function waitForQuestionNumber(page, minQuestionNo) {
  await page.waitForFunction(
    (minNo) => {
      const el = document.querySelector("[data-testid='question-counter']");
      if (!el || !el.textContent) return false;
      const match = /Question\s+(\d+)\s+(?:of|\/)\s+10/i.exec(el.textContent);
      if (!match) return false;
      return Number(match[1]) >= minNo;
    },
    minQuestionNo,
    { timeout: RESPONSE_TIMEOUT_MS },
  );
}

async function unlockSubmitByPlayingAudio(page, submitButton, maxClicks = 12) {
  let clicks = 0;
  const startedAt = Date.now();
  while (clicks < maxClicks && Date.now() - startedAt <= 75000) {
    if (!(await submitButton.isDisabled())) {
      return { unlocked: true, clicks };
    }
    const playButtons = page.locator("[data-testid='question-audio-button']");
    if ((await playButtons.count()) === 0) {
      break;
    }
    const playButton = playButtons.first();
    if (await playButton.isDisabled()) {
      if (Date.now() - startedAt > 75000) {
        break;
      }
      await page.waitForTimeout(500);
      continue;
    }
    await playButton.click();
    clicks += 1;

    const unlockWaitStarted = Date.now();
    while (Date.now() - unlockWaitStarted <= 12000) {
      if (!(await submitButton.isDisabled())) {
        return { unlocked: true, clicks };
      }
      await page.waitForTimeout(300);
    }
  }
  return { unlocked: !(await submitButton.isDisabled()), clicks };
}

async function submitQuestions(page, questionCount) {
  const stepResults = [];

  for (let i = 0; i < questionCount; i += 1) {
    await page.locator("[data-testid='question-counter']").first().waitFor({ timeout: RESPONSE_TIMEOUT_MS });
    const currentQuestionNo = await getQuestionNumber(page);
    const submitButton = page.locator("[data-testid='question-submit-button']").first();
    await submitButton.waitFor({ timeout: UI_TIMEOUT_MS });

    const answerMode = await answerCurrentQuestion(page, `matrix-${currentQuestionNo}`);
    await page.waitForTimeout(150);
    const disabledBeforeAudio = await submitButton.isDisabled();
    const unlockResult = await unlockSubmitByPlayingAudio(page, submitButton);
    const enabledAfterAudio = !(await submitButton.isDisabled());

    if (!enabledAfterAudio) {
      throw new Error(`Submit did not unlock after audio on question ${currentQuestionNo}`);
    }

    const submitResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/functions/v1/student-submit-response") &&
        response.request().method() === "POST",
      { timeout: RESPONSE_TIMEOUT_MS },
    );
    await submitButton.click();
    const submitResponse = await submitResponsePromise;
    const submitPayload = await submitResponse.json().catch(() => ({}));

    if (submitResponse.status() !== 200) {
      throw new Error(`student-submit-response failed (${submitResponse.status()}): ${JSON.stringify(submitPayload)}`);
    }

    const nextQuestionExists = Boolean(submitPayload?.nextQuestion);
    if (i === 0 && nextQuestionExists) {
      await waitForQuestionNumber(page, currentQuestionNo + 1);
    }

    stepResults.push({
      questionNo: currentQuestionNo,
      answerMode,
      disabledBeforeAudio,
      enabledAfterAudio,
      audioClicks: unlockResult.clicks,
      submitStatus: submitResponse.status(),
      nextQuestionExists,
    });
  }

  return stepResults;
}

async function verifyReducedMotionPolicy(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(config.appUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  await page.locator("main[data-motion-policy]").first().waitFor({ timeout: UI_TIMEOUT_MS });
  const reducedPolicy = await page.locator("main").first().getAttribute("data-motion-policy");
  const reducedPass = reducedPolicy === "reduced";

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(config.appUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  await page.locator("main[data-motion-policy]").first().waitFor({ timeout: UI_TIMEOUT_MS });
  const defaultPolicy = await page.locator("main").first().getAttribute("data-motion-policy");
  const defaultPass = defaultPolicy === "full";

  return {
    pass: reducedPass && defaultPass,
    details: {
      reducedPolicy,
      defaultPolicy,
    },
  };
}

async function verifySoundPreferencePersistence(page) {
  const soundSwitch = page.getByRole("switch").first();
  await soundSwitch.waitFor({ timeout: UI_TIMEOUT_MS });

  const initialChecked = (await soundSwitch.getAttribute("aria-checked")) === "true";
  await soundSwitch.click();
  await page.waitForTimeout(120);

  const toggledChecked = (await soundSwitch.getAttribute("aria-checked")) === "true";
  assert(
    toggledChecked !== initialChecked,
    "Sound toggle did not change state after click",
  );

  await page.goto(config.appUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await soundSwitch.waitFor({ timeout: UI_TIMEOUT_MS });

  const persistedChecked = (await soundSwitch.getAttribute("aria-checked")) === "true";
  const persistedMainFlag = await page
    .locator("main")
    .first()
    .getAttribute("data-sound-enabled");

  const uiPreferences = await page.evaluate(() => {
    const raw = window.localStorage.getItem("vocabpal.ui.preferences");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  return {
    pass:
      persistedChecked === toggledChecked &&
      persistedMainFlag === String(persistedChecked) &&
      uiPreferences?.soundEnabled === persistedChecked,
    details: {
      initialChecked,
      toggledChecked,
      persistedChecked,
      persistedMainFlag,
      persistedStoredValue: uiPreferences?.soundEnabled ?? null,
    },
  };
}

async function verifyDesignSystemRoute(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(`${config.appUrl}/designsystem`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    await page.getByRole("heading", { name: "Design System" }).first().waitFor({
      timeout: UI_TIMEOUT_MS,
    });
    addApiCheck("designsystem-route-render", true, {
      url: `${config.appUrl}/designsystem`,
    });
  } catch (error) {
    addApiCheck("designsystem-route-render", false, {
      url: `${config.appUrl}/designsystem`,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await context.close();
  }
}

async function runUiCase(browser, deviceProfile, networkProfile, student, caseId) {
  const caseResult = {
    caseId,
    device: deviceProfile.id,
    network: networkProfile.id,
    student,
    status: "running",
    startedAt: new Date().toISOString(),
    checks: [],
    attemptId: null,
    screenshot: null,
    error: null,
  };

  const context = await browser.newContext(deviceProfile.context);
  const page = await context.newPage();
  let blockedAudioCount = 0;

  try {
    await applyNetworkProfile(context, page, networkProfile);

    if (config.qaSourceToken) {
      await page.route("**/functions/v1/student-start-attempt", async (route) => {
        const request = route.request();
        let payload = {};
        try {
          payload = JSON.parse(request.postData() ?? "{}");
        } catch {
          payload = {};
        }

        await route.continue({
          headers: {
            ...request.headers(),
            "x-vocabpal-qa-source-token": config.qaSourceToken,
          },
          postData: JSON.stringify({
            ...payload,
            attemptSource: "qa",
          }),
        });
      });
    }

    await page.addInitScript(() => {
      class MockAudio {
        constructor(src) {
          this.src = src;
          this.currentTime = 0;
          this.onended = null;
          this.onerror = null;
        }
        play() {
          return Promise.resolve().then(() => {
            setTimeout(() => {
              if (typeof this.onended === "function") {
                this.onended();
              }
            }, 150);
          });
        }
        pause() {}
      }
      window.Audio = MockAudio;
    });

    await page.route("**/functions/v1/student-question-audio/**", async (route) => {
      if (blockedAudioCount < networkProfile.abortAudioCount) {
        blockedAudioCount += 1;
        await route.abort("failed");
        return;
      }
      if (networkProfile.jitterMs > 0) {
        const jitter = Math.floor(Math.random() * networkProfile.jitterMs);
        await new Promise((resolve) => setTimeout(resolve, jitter));
      }
      await route.continue();
    });

    const reducedMotionCheck = await verifyReducedMotionPolicy(page);
    caseResult.checks.push({
      name: "reduced-motion-policy",
      pass: reducedMotionCheck.pass,
      details: reducedMotionCheck.details,
    });

    const soundPreferenceCheck = await verifySoundPreferencePersistence(page);
    caseResult.checks.push({
      name: "sound-toggle-persistence",
      pass: soundPreferenceCheck.pass,
      details: soundPreferenceCheck.details,
    });

    await page.locator("#student-first-name").first().waitFor({ timeout: UI_TIMEOUT_MS });
    await page.locator("#student-first-name").fill(student.firstName);
    await page.locator("#student-last-name").fill(student.lastName);

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Choose your class and section", { exact: false }).first().waitFor({
      timeout: UI_TIMEOUT_MS,
    });

    const entryForm = page.locator("form").first();
    await entryForm.waitFor({ timeout: UI_TIMEOUT_MS });

    const classButtons = entryForm.getByRole("button", {
      name: String(student.classNumber),
      exact: true,
    });
    const sectionButtons = entryForm.getByRole("button", {
      name: student.sectionLetter,
      exact: true,
    });

    await classButtons.first().click();
    await sectionButtons.first().click();

    const startButton = page.getByRole("button", { name: "Start test" });
    let startResponse = null;
    let startPayload = {};
    let startFailure = null;
    const startTimeoutMs = networkProfile.id === "slow_3g_spotty" ? 90000 : RESPONSE_TIMEOUT_MS;

    for (let attemptNo = 1; attemptNo <= START_MAX_ATTEMPTS; attemptNo += 1) {
      try {
        await classButtons.first().click();
        await sectionButtons.first().click();
        await startButton.waitFor({ timeout: UI_TIMEOUT_MS });
        await page.waitForFunction(
          () => {
            const button = Array.from(document.querySelectorAll("button"))
              .find((node) => node.textContent?.trim().toLowerCase() === "start test");
            return Boolean(button && !button.hasAttribute("disabled"));
          },
          null,
          { timeout: UI_TIMEOUT_MS },
        );

        const startResponsePromise = page.waitForResponse(
          (response) =>
            response.url().includes("/functions/v1/student-start-attempt") &&
            response.request().method() === "POST",
          { timeout: startTimeoutMs },
        );
        await startButton.click();
        startResponse = await startResponsePromise;
        startPayload = await startResponse.json().catch(() => ({}));
        if (startResponse.status() === 200 && startPayload?.attemptId) {
          startFailure = null;
          break;
        }
        startFailure = new Error(
          `student-start-attempt failed (${startResponse.status()}): ${JSON.stringify(startPayload)}`,
        );
      } catch (error) {
        startFailure = error instanceof Error ? error : new Error(String(error));
      }
      await page.waitForTimeout(500 * attemptNo);
    }

    if (!startResponse || startResponse.status() !== 200 || !startPayload?.attemptId) {
      throw startFailure ?? new Error("student-start-attempt failed after retries");
    }

    caseResult.attemptId = startPayload.attemptId;
    caseResult.checks.push({
      name: "student-start-attempt",
      pass: true,
      details: { status: startResponse.status(), attemptId: caseResult.attemptId },
    });

    const questionSteps = await submitQuestions(page, config.questionsToSubmit);
    for (const step of questionSteps) {
      caseResult.checks.push({
        name: `question-${step.questionNo}-audio-gate`,
        pass: step.disabledBeforeAudio && step.enabledAfterAudio,
        details: step,
      });
    }

    if (config.finalizeAttempt) {
      const complete = await callFunction("student-complete-attempt", {
        method: "POST",
        body: { attemptId: caseResult.attemptId },
      });
      caseResult.checks.push({
        name: "student-complete-attempt",
        pass: complete.status === 200,
        details: { status: complete.status, payload: complete.payload },
      });
    }

    const allChecksPass = caseResult.checks.every((check) => check.pass);
    caseResult.status = allChecksPass ? "passed" : "failed";
    if (!allChecksPass) {
      caseResult.error = "One or more case checks failed";
    }
  } catch (error) {
    caseResult.status = "failed";
    caseResult.error = error instanceof Error ? error.message : String(error);
    const outDir = join(process.cwd(), "qa", "reports", "screenshots");
    mkdirSync(outDir, { recursive: true });
    const shotPath = join(outDir, `${caseId}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    caseResult.screenshot = shotPath;
  } finally {
    await context.close();
    caseResult.endedAt = new Date().toISOString();
  }

  return caseResult;
}

async function runDataIntegrityChecks(token, scenarioStudents, attemptIds) {
  const list = await callFunction("teacher-dashboard-list?limit=200&source=all", { token });
  const attempts = list.payload?.attempts ?? [];
  const matrixAttempts = attempts.filter((attempt) =>
    scenarioStudents.some(
      (student) =>
        attempt.student?.firstName === student.firstName &&
        attempt.student?.lastName === student.lastName &&
        attempt.student?.className === student.className,
    )
  );

  const expectedAtLeast = attemptIds.length;
  const identityCheckPass = matrixAttempts.length >= expectedAtLeast;
  addApiCheck("dashboard-list-has-matrix-attempts", identityCheckPass, {
    dashboardMatches: matrixAttempts.length,
    expectedAtLeast,
    attemptedCases: scenarioStudents.length,
  });

  let detailChecksPass = true;
  for (const attemptId of attemptIds) {
    const detail = await callFunction(`teacher-attempt-detail/${attemptId}`, { token });
    const responses = detail.payload?.responses ?? [];
    const hasMinResponses =
      detail.status === 200 &&
      responses.length >= Math.max(1, config.questionsToSubmit);
    const hasValidTimes = responses.every(
      (row) =>
        Number.isFinite(row.responseTimeMs) &&
        row.responseTimeMs >= 0 &&
        row.responseTimeMs <= 600000,
    );
    const pass = hasMinResponses && hasValidTimes;
    detailChecksPass = detailChecksPass && pass;
    addApiCheck("attempt-detail-timing", pass, {
      attemptId,
      status: detail.status,
      responseCount: responses.length,
      expectedMinResponses: Math.max(1, config.questionsToSubmit),
    });
  }

  const summary = await callFunction("teacher-dashboard-summary?source=all", { token });
  const summaryPass = summary.status === 200 && Number.isFinite(summary.payload?.attemptsTotal);
  addApiCheck("teacher-dashboard-summary", summaryPass, {
    status: summary.status,
    attemptsTotal: summary.payload?.attemptsTotal ?? null,
    attemptsToday: summary.payload?.attemptsToday ?? null,
  });

  return identityCheckPass && detailChecksPass && summaryPass;
}

async function cleanupQaAttempts(token, attemptIds) {
  const uniqueAttemptIds = Array.from(new Set(attemptIds.filter(Boolean)));
  if (!token || uniqueAttemptIds.length === 0) return;
  const cleanup = await callFunction("teacher-attempt-archive", {
    method: "POST",
    token,
    body: { attemptIds: uniqueAttemptIds },
  });
  const missingAttemptIds = Array.isArray(cleanup.payload?.missingAttemptIds)
    ? cleanup.payload.missingAttemptIds.filter((value) => typeof value === "string")
    : [];
  const idempotentMissingOnly =
    cleanup.status === 404 &&
    missingAttemptIds.length > 0 &&
    missingAttemptIds.length <= uniqueAttemptIds.length;
  addApiCheck("qa-cleanup-archives", cleanup.status === 200 || idempotentMissingOnly, {
    status: cleanup.status,
    requested: uniqueAttemptIds.length,
    movedToArchivesCount: cleanup.payload?.movedToArchivesCount ?? cleanup.payload?.archivedCount ?? null,
    skippedMissing: missingAttemptIds.length,
    legacyArchivedCountPresent: typeof cleanup.payload?.archivedCount === "number",
  });
}

async function main() {
  const runId = Date.now().toString().slice(-6);
  const matrixCases = [];

  let counter = 0;
  for (const device of DEVICE_PROFILES) {
    for (const network of NETWORK_PROFILES) {
      counter += 1;
      const classNumber = ((counter - 1) % 6) + 1;
      const sectionLetter = String.fromCharCode(65 + ((counter - 1) % 6));
      const student = {
        firstName: `Mx${runId}${String(counter).padStart(2, "0")}`,
        lastName: "Pilot",
        classNumber,
        sectionLetter,
        className: `Class ${classNumber} - Section ${sectionLetter}`,
      };
      matrixCases.push({
        caseId: `${device.id}__${network.id}`,
        device,
        network,
        student,
      });
    }
  }

  const effectiveCases =
    Number.isFinite(config.caseLimit) && config.caseLimit > 0
      ? matrixCases.slice(0, config.caseLimit)
      : matrixCases;
  const effectiveStudents = effectiveCases.map((matrixCase) => matrixCase.student);

  report.artifacts.runId = runId;
  report.artifacts.caseCount = effectiveCases.length;

  const token = await loginTeacher();
  report.artifacts.teacherTokenIssued = true;

  const allowlist = effectiveStudents.map((student) => ({
    firstName: student.firstName,
    lastName: student.lastName,
    className: student.className,
  }));
  const windowId = await createAllowlistSession(token, allowlist);
  report.artifacts.windowId = windowId;

  const browser = await chromium.launch({ headless: true });
  const finishedCases = [];
  try {
    await verifyDesignSystemRoute(browser);

    for (const matrixCase of effectiveCases) {
      const result = await runUiCase(
        browser,
        matrixCase.device,
        matrixCase.network,
        matrixCase.student,
        matrixCase.caseId,
      );
      finishedCases.push(result);
      report.matrix.push(result);
    }
  } finally {
    await browser.close();
  }

  const attemptIds = finishedCases
    .filter((item) => item.attemptId)
    .map((item) => item.attemptId);

  await runDataIntegrityChecks(token, effectiveStudents, attemptIds);
  await cleanupQaAttempts(token, attemptIds);
  await updateSessionStatus(token, windowId, "ended");
  await logoutTeacher(token);

  const allCasePass = finishedCases.length > 0 && finishedCases.every((item) => item.status === "passed");
  const allApiPass = report.apiChecks.every((item) => item.pass);
  report.status = allCasePass && allApiPass ? "passed" : "failed";
  report.summary = {
    totalCases: finishedCases.length,
    passedCases: finishedCases.filter((item) => item.status === "passed").length,
    failedCases: finishedCases.filter((item) => item.status !== "passed").length,
    apiChecksPassed: report.apiChecks.filter((item) => item.pass).length,
    apiChecksTotal: report.apiChecks.length,
  };
}

const outDir = join(process.cwd(), "qa", "reports");
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, "latest_matrix_ui_network.json");
const datedPath = join(outDir, `matrix_ui_network_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  await main();
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(latestPath, content, "utf8");
  writeFileSync(datedPath, content, "utf8");
  console.log(`QA matrix report written to ${latestPath}`);
  console.log(`QA matrix report written to ${datedPath}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

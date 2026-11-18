
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import cron from 'node-cron';
import { alertNotificationService } from '../src/services/alertNotificationService.js';

import {
  initializeAlertScheduler,
  stopAlertScheduler
} from '../src/schedulers/alertScheduler.js';

const EXPECTED_EXPRESSIONS = [
  '0 9 * * *',
  '0 17 * * *',
  '0 10 * * 1'
];

let createdTasks = [];
let scheduleMock;
let analyzeMock;

function setupMocks({ analyzeImplementation } = {}) {
  createdTasks = [];

  scheduleMock = mock.method(cron, 'schedule', (expression, callback, options) => {
    const task = {
      expression,
      callback,
      options,
      stopCalls: 0,
      stop() {
        this.stopCalls += 1;
      }
    };

    createdTasks.push(task);
    return task;
  });

  analyzeMock = mock.method(
    alertNotificationService,
    'analyzeAndSendAlerts',
    analyzeImplementation || (async () => ({
      success: true,
      alertsSent: 0
    }))
  );
}

afterEach(async () => {
  try {
    await stopAlertScheduler();
  } finally {
    mock.restoreAll();
  }
});

test('registers three schedules with Asia/Kolkata timezone', () => {
  setupMocks();

  initializeAlertScheduler();

  assert.equal(scheduleMock.mock.callCount(), 3);

  assert.deepEqual(
    createdTasks.map(task => task.expression),
    EXPECTED_EXPRESSIONS
  );

  for (const task of createdTasks) {
    assert.deepEqual(task.options, {
      scheduled: true,
      timezone: 'Asia/Kolkata'
    });
  }
});

test('prevents duplicate scheduler initialization', () => {
  setupMocks();

  initializeAlertScheduler();
  initializeAlertScheduler();

  assert.equal(scheduleMock.mock.callCount(), 3);
  assert.equal(createdTasks.length, 3);
});

test('stops only scheduler-owned tasks', async () => {
  setupMocks();

  const unrelatedTask = {
    stopCalls: 0,
    stop() {
      this.stopCalls += 1;
    }
  };

  const getTasksMock = mock.method(
    cron,
    'getTasks',
    () => [unrelatedTask]
  );

  initializeAlertScheduler();

  await stopAlertScheduler();

  assert.deepEqual(
    createdTasks.map(task => task.stopCalls),
    [1, 1, 1]
  );

  assert.equal(unrelatedTask.stopCalls, 0);
  assert.equal(getTasksMock.mock.callCount(), 0);
});

test('waits for active alert analysis during shutdown', async () => {
  let resolveAnalysis;

  setupMocks({
    analyzeImplementation: () => new Promise(resolve => {
      resolveAnalysis = resolve;
    })
  });

  initializeAlertScheduler();

  const execution = createdTasks[0].callback();

  await Promise.resolve();

  let stopped = false;

  const stopping = stopAlertScheduler().then(() => {
    stopped = true;
  });

  await Promise.resolve();

  assert.equal(stopped, false);

  resolveAnalysis({
    success: true,
    alertsSent: 0
  });

  await execution;
  await stopping;

  assert.equal(stopped, true);
  assert.equal(analyzeMock.mock.callCount(), 1);
});

test('rejects queued callbacks after shutdown begins', async () => {
  setupMocks();

  initializeAlertScheduler();

  const queuedCallback = createdTasks[0].callback;

  await stopAlertScheduler();

  await queuedCallback();

  assert.equal(analyzeMock.mock.callCount(), 0);
});

test('concurrent stop calls share one shutdown promise', async () => {
  let resolveAnalysis;

  setupMocks({
    analyzeImplementation: () => new Promise(resolve => {
      resolveAnalysis = resolve;
    })
  });

  initializeAlertScheduler();

  const execution = createdTasks[0].callback();

  await Promise.resolve();

  const firstStop = stopAlertScheduler();
  const secondStop = stopAlertScheduler();

  assert.equal(firstStop, secondStop);

  resolveAnalysis({
    success: true,
    alertsSent: 0
  });

  await execution;
  await firstStop;
});

test('allows reinitialization after graceful shutdown', async () => {
  setupMocks();

  initializeAlertScheduler();

  await stopAlertScheduler();

  initializeAlertScheduler();

  assert.equal(scheduleMock.mock.callCount(), 6);

  assert.deepEqual(
    createdTasks.slice(3).map(task => task.expression),
    EXPECTED_EXPRESSIONS
  );
});

test('recovers from a task-stop failure without allowing premature reinitialization', async () => {
  let resolveAnalysis;
  let firstStopAttempt = true;

  setupMocks({
    analyzeImplementation: () => new Promise(resolve => {
      resolveAnalysis = resolve;
    })
  });

  initializeAlertScheduler();

  // Make the first task fail only on its first stop attempt.
  const originalStop = createdTasks[0].stop;

  createdTasks[0].stop = function () {
  if (firstStopAttempt) {
    firstStopAttempt = false;
    this.stopCalls += 1;
    throw new Error('Simulated task-stop failure');
  }

  originalStop.call(this);
};

  // Start an alert analysis that remains active during shutdown.
  const execution = createdTasks[0].callback();

  await Promise.resolve();

  // First shutdown attempt should stop all tasks and drain active work.
  const firstStop = stopAlertScheduler();

  assert.deepEqual(
    createdTasks.map(task => task.stopCalls),
    [1, 1, 1]
  );

  // Initialization must remain blocked while shutdown is incomplete.
  initializeAlertScheduler();

  assert.equal(scheduleMock.mock.callCount(), 3);

  resolveAnalysis({
    success: true,
    alertsSent: 0
  });

  await execution;

  await assert.rejects(
    firstStop,
    /One or more alert scheduler tasks failed to stop/
  );

  // Retry shutdown after the simulated failure.
  await stopAlertScheduler();

  assert.deepEqual(
    createdTasks.map(task => task.stopCalls),
    [2, 2, 2]
  );

  // Reinitialization is permitted after successful cleanup.
  initializeAlertScheduler();

  assert.equal(scheduleMock.mock.callCount(), 6);
});

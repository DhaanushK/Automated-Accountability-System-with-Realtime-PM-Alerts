
export function createShutdownHandler({
  shutdown,
  exit = code => process.exit(code),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  timeoutMs = 10000,
  onStart = () => {},
  onTimeout = () => {},
  onError = () => {}
}) {
  if (typeof shutdown !== "function") {
    throw new Error("A shutdown function is required");
  }

  let shutdownPromise = null;
  let exitRequested = false;
  let timedOut = false;

  const requestExit = code => {
    if (exitRequested) return;

    exitRequested = true;
    exit(code);
  };

  return function handleShutdown() {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    onStart();

    const forceExitTimer = setTimer(() => {
      timedOut = true;
      onTimeout();
      requestExit(1);
    }, timeoutMs);

    shutdownPromise = (async () => {
      let exitCode = 0;

      try {
        const result = await shutdown();

        if (!result?.success) {
          exitCode = 1;
        }
      } catch (error) {
        exitCode = 1;
        onError(error);
      } finally {
        clearTimer(forceExitTimer);
      }

      // Do not request a second exit if the timeout already fired.
      if (!timedOut) {
        requestExit(exitCode);
      }
    })();

    return shutdownPromise;
  };
}

export function registerShutdownSignals(
  handler,
  emitter = process
) {
  if (typeof handler !== "function") {
    throw new Error("A shutdown handler is required");
  }

  emitter.on("SIGINT", handler);
  emitter.on("SIGTERM", handler);

  return () => {
    emitter.off("SIGINT", handler);
    emitter.off("SIGTERM", handler);
  };
}

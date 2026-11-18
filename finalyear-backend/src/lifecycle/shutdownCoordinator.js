
export function createShutdownCoordinator({
  stopScheduler = async () => {},
  closeHttpServer = async () => {},
  closeDatabase = async () => {}
} = {}) {
  let shutdownPromise = null;

  async function executeShutdown() {
    const errors = [];

    const operations = [
      ["scheduler", stopScheduler],
      ["http-server", closeHttpServer],
      ["database", closeDatabase]
    ];

    for (const [stage, operation] of operations) {
      try {
        await operation();
      } catch (error) {
        errors.push({ stage, error });
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  return function shutdown() {
    if (!shutdownPromise) {
      shutdownPromise = executeShutdown();
    }

    return shutdownPromise;
  };
}

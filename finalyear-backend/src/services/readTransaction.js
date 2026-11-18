
import mongoose from "mongoose";

/**
 * Creates a read-only transaction runner.
 *
 * Every read operation executed through this runner uses:
 * - Primary read preference
 * - Snapshot read concern
 * - One shared MongoDB session
 *
 * There is deliberately no non-transactional fallback.
 */
export function createReadTransactionRunner(
  connection = mongoose.connection
) {
return async function runReadTransaction(operation) {
  if (typeof operation !== "function") {
    throw new TypeError("Read transaction operation must be a function");
  }

  if (connection.readyState !== 1) {
    throw new Error("DATABASE_UNAVAILABLE");
  }

  const session = await connection.startSession();

  let operationFailed = false;
  let operationError;

  try {
    let result;

    await session.withTransaction(
      async () => {
        result = await operation(session);
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" }
      }
    );

    return result;
  } catch (error) {
    operationFailed = true;
    operationError = error;
    throw error;
  } finally {
    try {
      await session.endSession();
    } catch (cleanupError) {
      if (!operationFailed) {
        throw cleanupError;
      }

      if (operationError instanceof Error) {
        try {
          Object.defineProperty(operationError, "cleanupError", {
            value: cleanupError,
            configurable: true,
            enumerable: false,
            writable: true
          });
        } catch {
          throw new AggregateError(
            [operationError, cleanupError],
            "Read transaction and session cleanup both failed",
            { cause: operationError }
          );
        }
      } else {
        throw new AggregateError(
          [operationError, cleanupError],
          "Read transaction and session cleanup both failed",
          { cause: operationError }
        );
      }
    }
  }
};

}

// Production runner uses the application's default Mongoose connection.
export const runReadTransaction = createReadTransactionRunner();

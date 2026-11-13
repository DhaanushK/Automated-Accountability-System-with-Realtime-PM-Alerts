
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

    // Fail closed if MongoDB is not connected.
    if (connection.readyState !== 1) {
      throw new Error("DATABASE_UNAVAILABLE");
    }

    const session = await connection.startSession();

    try {
      let result;

      await session.withTransaction(
        async () => {
          result = await operation(session);
        },
        {
          readPreference: "primary",
          readConcern: {
            level: "snapshot"
          }
        }
      );

      return result;
    } finally {
      await session.endSession();
    }
  };
}

// Production runner uses the application's default Mongoose connection.
export const runReadTransaction = createReadTransactionRunner();

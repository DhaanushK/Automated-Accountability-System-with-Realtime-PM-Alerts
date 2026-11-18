
import mongoose from "mongoose";

const connectionsWithListeners = new WeakSet();

const DEFAULT_CONNECTION_OPTIONS = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  family: 4,
  autoIndex: false,
  retryWrites: true,
  retryReads: true
};

export function createConnectionManager({
  mongooseInstance,
  getMongoUri = () => process.env.MONGO_URI,
  connectionOptions = DEFAULT_CONNECTION_OPTIONS
}) {
  if (
    !mongooseInstance?.connection ||
    typeof mongooseInstance.connect !== "function"
  ) {
    throw new Error("A valid Mongoose instance is required");
  }

  const connection = mongooseInstance.connection;

  let connectionPromise = null;
  let disconnectPromise = null;

  // Register listeners only once per Mongoose connection.
  if (!connectionsWithListeners.has(connection)) {
    connection.on("connected", () => {
      console.log("MongoDB connected successfully");
    });

    connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
    });

    connection.on("reconnected", () => {
      console.log("MongoDB reconnected successfully");
    });

    connection.on("error", error => {
      console.error("MongoDB connection error:", error.message);
    });

    connectionsWithListeners.add(connection);
  }

  const connectDB = async () => {
    // Prevent new connections during shutdown.
    if (disconnectPromise) {
      throw new Error(
        "MongoDB connection is currently disconnecting"
      );
    }

    // Reuse an established connection.
    if (connection.readyState === 1) {
      return connection;
    }

    // Reuse an in-flight connection attempt.
    if (connectionPromise) {
      return connectionPromise;
    }

    // Wait for a connection initiated outside this manager.
    if (connection.readyState === 2) {
      connectionPromise = connection.asPromise()
        .then(() => connection)
        .finally(() => {
          connectionPromise = null;
        });

      return connectionPromise;
    }

    // Do not initiate a new connection while disconnecting.
    if (connection.readyState === 3) {
      throw new Error(
        "MongoDB connection is currently disconnecting"
      );
    }

    // URI is needed only when initiating a new connection.
    const mongoUri = getMongoUri();

    if (typeof mongoUri !== "string" || !mongoUri.trim()) {
      throw new Error("MONGO_URI is not configured");
    }

    connectionPromise = mongooseInstance.connect(
      mongoUri,
      connectionOptions
    )
      .then(() => connection)
      .catch(error => {
        console.error("Error connecting DB:", error.message);
        throw error;
      })
      .finally(() => {
        connectionPromise = null;
      });

    return connectionPromise;
  };

  const disconnectDB = () => {
    // Share an existing disconnect operation.
    if (disconnectPromise) {
      return disconnectPromise;
    }

    disconnectPromise = (async () => {
      // Capture the connection attempt already in progress.
      const pendingConnection = connectionPromise;

      if (pendingConnection) {
        try {
          await pendingConnection;
        } catch {
          // A failed connection attempt should not prevent cleanup.
        }
      } else if (connection.readyState === 2) {
        // Handle a connection initiated outside this manager.
        try {
          await connection.asPromise();
        } catch {
          // Continue cleanup after a failed external connection.
        }
      }

      // Close the connection only if it is not already closed.
      if (connection.readyState !== 0) {
        await connection.close();
      }
    })().finally(() => {
      disconnectPromise = null;
    });

    return disconnectPromise;
  };

  // Preserve the existing function-based API.
  connectDB.disconnect = disconnectDB;

  return connectDB;
}

const connectDB = createConnectionManager({
  mongooseInstance: mongoose
});

export default connectDB;

import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  APPROVED_DATABASE_NAME,
  APPROVED_MONGODB_HOST,
  APPROVED_MONGODB_PORT,
  APPROVED_REPLICA_MEMBER,
  APPROVED_REPLICA_SET,
  getVerifiedIntegrationIdentity,
  setupIntegrationDatabase,
  teardownIntegrationDatabase
} from "./support/mongoIntegration.js";

const MARKER_COLLECTION = "integration_provisioning";

export async function provisionIntegrationDatabase() {
  let result;
  let connectionClosed = false;
  try {
    const connection = await setupIntegrationDatabase();
    const identity = getVerifiedIntegrationIdentity(connection);

    if (
      identity.host !== APPROVED_MONGODB_HOST ||
      identity.port !== APPROVED_MONGODB_PORT ||
      identity.databaseName !== APPROVED_DATABASE_NAME ||
      identity.replicaSetName !== APPROVED_REPLICA_SET ||
      identity.isWritablePrimary !== true ||
      identity.member !== APPROVED_REPLICA_MEMBER ||
      identity.members.length !== 1 ||
      identity.members[0] !== APPROVED_REPLICA_MEMBER
    ) {
      throw new Error("Verified database identity does not match the authorized provisioning target.");
    }

    const existingMarker = await connection.db
      .listCollections({ name: MARKER_COLLECTION }, { nameOnly: true })
      .hasNext();
    let markerCreated = false;
    if (!existingMarker) {
      await connection.db.createCollection(MARKER_COLLECTION);
      markerCreated = true;
    }

    const collections = await connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const collectionNames = collections.map(collection => collection.name).sort();
    if (!collectionNames.includes(MARKER_COLLECTION)) {
      throw new Error("Provisioning marker collection was not present after provisioning.");
    }

    result = {
      target: identity,
      databaseExists: true,
      markerCollection: MARKER_COLLECTION,
      markerCreated,
      collections: collectionNames
    };
  } finally {
    await teardownIntegrationDatabase();
    connectionClosed = mongoose.connection.readyState === 0;
  }

  if (!connectionClosed) {
    throw new Error("The guarded Mongoose connection did not close cleanly.");
  }
  return { ...result, connectionClosed };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  provisionIntegrationDatabase()
    .then(result => {
      console.log("Integration database provisioning verified:");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error("Integration database provisioning failed:", error.message);
      process.exitCode = 1;
    });
}

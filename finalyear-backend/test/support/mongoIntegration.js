import mongoose from "mongoose";
import { isDeepStrictEqual } from "node:util";

export const APPROVED_MONGODB_HOST = "127.0.0.1";
export const APPROVED_MONGODB_PORT = 27018;
export const APPROVED_REPLICA_SET = "accountabilityTestRS";
export const APPROVED_DATABASE_NAME = "accountability_app_integration_test";
export const PROBE_DATABASE_NAME = "accountability_transaction_test";
export const APPROVED_REPLICA_MEMBER = APPROVED_MONGODB_HOST + ":" + APPROVED_MONGODB_PORT;

// Fixed in source: deliberately independent of process.env, dotenv and app config.
export const INTEGRATION_TEST_URI =
  "mongodb://" + APPROVED_REPLICA_MEMBER + "/" + APPROVED_DATABASE_NAME +
  "?replicaSet=" + APPROVED_REPLICA_SET;

export const INTEGRATION_COLLECTION_ALLOWLIST = Object.freeze([
  "users",
  "submission_policies",
  "expected_submissions",
  "metric_submissions"
]);

const verifiedConnections = new WeakSet();
const verifiedConnectionIdentity = new WeakMap();
const fixtureRegistrations = new WeakMap();

const FIXTURE_OWNER_FIELDS = Object.freeze({
  users: Object.freeze(["email", "name", "role", "active"]),
  submission_policies: Object.freeze(["policyVersion", "effectiveStartDate"]),
  expected_submissions: Object.freeze(["employeeId", "reportingDate", "expected", "policyVersion"]),
  metric_submissions: Object.freeze(["employeeId", "reportingDate", "actualSubmittedAt", "policyVersion"])
});

const REQUIRED_OWNER_FIELDS = Object.freeze({
  users: Object.freeze(["email"]),
  submission_policies: Object.freeze(["policyVersion"]),
  expected_submissions: Object.freeze(["employeeId", "reportingDate", "policyVersion"]),
  metric_submissions: Object.freeze(["employeeId", "reportingDate", "actualSubmittedAt", "policyVersion"])
});

export function validateIntegrationTarget(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new TypeError("A fixed integration-test target is required.");
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new TypeError("The integration-test target is invalid.");
  }

  if (parsed.protocol !== "mongodb:") {
    throw new TypeError("Only the approved MongoDB protocol is allowed.");
  }
  if (parsed.hostname !== APPROVED_MONGODB_HOST) {
    throw new TypeError("The integration-test host is not approved.");
  }
  if (parsed.port !== String(APPROVED_MONGODB_PORT)) {
    throw new TypeError("The integration-test port is not approved.");
  }
  if (parsed.pathname !== "/" + APPROVED_DATABASE_NAME) {
    throw new TypeError("The integration-test database is not approved.");
  }
  if (parsed.username || parsed.password || candidate.includes("@")) {
    throw new TypeError("Credentials are not allowed in the integration-test target.");
  }
  if (candidate.includes("#")) {
    throw new TypeError("Fragments are not allowed in the integration-test target.");
  }

  const options = [...parsed.searchParams.entries()];
  if (
    options.length !== 1 ||
    options[0][0] !== "replicaSet" ||
    options[0][1] !== APPROVED_REPLICA_SET
  ) {
    throw new TypeError("The integration-test target has unexpected or invalid URI options.");
  }

  return Object.freeze({
    hostname: parsed.hostname,
    port: Number(parsed.port),
    databaseName: parsed.pathname.slice(1),
    replicaSetName: parsed.searchParams.get("replicaSet")
  });
}

function assertConnectionAddress(connection) {
  if (
    connection.host !== APPROVED_MONGODB_HOST ||
    Number(connection.port) !== APPROVED_MONGODB_PORT ||
    connection.name !== APPROVED_DATABASE_NAME ||
    connection.readyState !== 1
  ) {
    throw new Error("The active Mongoose connection does not match the approved integration target.");
  }
}

async function verifyReplicaSet(connection) {
  let hello;
  try {
    hello = await connection.db.admin().command({ hello: 1 });
  } catch {
    throw new Error("Could not verify the integration replica-set identity.");
  }

  if (hello?.setName !== APPROVED_REPLICA_SET || hello?.isWritablePrimary !== true) {
    throw new Error("The integration MongoDB server is not the approved replica-set primary.");
  }

  for (const memberIdentity of [hello.me, hello.primary]) {
    if (memberIdentity && memberIdentity !== APPROVED_REPLICA_MEMBER) {
      throw new Error("The integration replica-set member identity is not approved.");
    }
  }

  if (
    Array.isArray(hello.hosts) &&
    (hello.hosts.length !== 1 || hello.hosts[0] !== APPROVED_REPLICA_MEMBER)
  ) {
    throw new Error("The integration replica set is not the approved single local member.");
  }

  return Object.freeze({
    replicaSetName: hello.setName,
    isWritablePrimary: hello.isWritablePrimary === true,
    member: hello.me || hello.primary || null,
    primary: hello.primary || null,
    members: Array.isArray(hello.hosts) ? [...hello.hosts] : []
  });
}

export async function setupIntegrationDatabase({
  client = mongoose,
  target = INTEGRATION_TEST_URI
} = {}) {
  // This validation must remain before any call to connect().
  validateIntegrationTarget(target);

  if (client.connection.readyState !== 0) {
    throw new Error("Integration setup requires a fresh, disconnected Mongoose process.");
  }

  try {
    await client.connect(target, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      autoIndex: false,
      autoCreate: false,
      retryWrites: true
    });
  } catch {
    try {
      await client.disconnect();
    } catch {
      // Preserve the sanitized setup failure; never log connection details.
    }
    throw new Error("Could not connect to the approved integration-test database.");
  }

  const connection = client.connection;
  try {
    assertConnectionAddress(connection);
    const replicaIdentity = await verifyReplicaSet(connection);
    assertConnectionAddress(connection);
    verifiedConnectionIdentity.set(connection, Object.freeze({
      host: connection.host,
      port: Number(connection.port),
      databaseName: connection.name,
      ...replicaIdentity
    }));
    verifiedConnections.add(connection);
    return connection;
  } catch (error) {
    verifiedConnections.delete(connection);
    verifiedConnectionIdentity.delete(connection);
    try {
      await client.disconnect();
    } catch {
      // Preserve the sanitized verification failure; never log connection details.
    }
    throw error;
  }
}

function assertVerifiedConnection(connection) {
  if (!connection || !verifiedConnections.has(connection)) {
    throw new Error("Integration database identity has not been verified; operation refused.");
  }
  assertConnectionAddress(connection);
}

export function assertIntegrationFixtureConnection(connection) {
  assertVerifiedConnection(connection);
  if (connection.name !== APPROVED_DATABASE_NAME) {
    throw new Error("Fixture operation is not bound to the approved integration database.");
  }
}

export function getVerifiedIntegrationIdentity(connection = mongoose.connection) {
  assertVerifiedConnection(connection);
  const identity = verifiedConnectionIdentity.get(connection);
  if (!identity) {
    throw new Error("Verified integration identity is unavailable.");
  }
  return identity;
}

function indexKeySignature(key) {
  return JSON.stringify(Object.entries(key));
}

function generatedIndexName(key) {
  return Object.entries(key).map(([field, direction]) => field + "_" + direction).join("_");
}

const SEMANTIC_INDEX_OPTIONS = Object.freeze([
  "unique", "sparse", "expireAfterSeconds", "partialFilterExpression", "collation", "hidden",
  "wildcardProjection", "weights", "default_language", "language_override", "textIndexVersion",
  "2dsphereIndexVersion", "bits", "min", "max", "bucketSize", "storageEngine"
]);

/** Read and verify declared indexes without creating or changing any index. */
export async function verifyDeclaredIndexes(Model) {
  const connection = Model?.db;
  assertVerifiedConnection(connection);
  const collectionName = Model.collection?.collectionName;
  if (!INTEGRATION_COLLECTION_ALLOWLIST.includes(collectionName)) {
    throw new Error("Index verification is outside the integration collection allowlist.");
  }

  const expectedIndexes = Model.schema.indexes().map(([key, options]) => ({
    key,
    name: options.name || generatedIndexName(key),
    options
  }));
  let actualIndexes;
  try {
    actualIndexes = await Model.collection.listIndexes().toArray();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === "NamespaceNotFound") actualIndexes = [];
    else throw error;
  }

  for (const expected of expectedIndexes) {
    const keySignature = indexKeySignature(expected.key);
    const byName = actualIndexes.find(index => index.name === expected.name);
    const byKey = actualIndexes.find(index => indexKeySignature(index.key) === keySignature);
    const actual = byName || byKey;
    if (!actual) {
      throw new Error("Missing declared index for " + Model.modelName + ": " + expected.name);
    }
    if (actual.name !== expected.name || indexKeySignature(actual.key) !== keySignature) {
      throw new Error("Incompatible declared index for " + Model.modelName + ": " + expected.name);
    }
    for (const option of SEMANTIC_INDEX_OPTIONS) {
      const expectedValue = expected.options[option] ?? (option === "unique" || option === "sparse" || option === "hidden" ? false : undefined);
      const actualValue = actual[option] ?? (option === "unique" || option === "sparse" || option === "hidden" ? false : undefined);
      if (!isDeepStrictEqual(actualValue, expectedValue)) {
        throw new Error("Incompatible declared index for " + Model.modelName + ": " + expected.name + " (" + option + ")");
      }
    }
  }

  return {
    model: Model.modelName,
    collection: collectionName,
    expected: expectedIndexes.map(({ name, key, options }) => ({ name, key, unique: options.unique === true })),
    actual: actualIndexes.map(({ name, key, unique }) => ({ name, key, unique: unique === true }))
  };
}

function copyOwnershipValue(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (value && typeof value.toHexString === "function") return new mongoose.Types.ObjectId(value);
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  throw new TypeError("Fixture ownership values must be scalar values.");
}

/** Register one fixture ID with persisted fields that prove test-run ownership. */
export function registerIntegrationFixture({
  connection = mongoose.connection,
  collectionName,
  id,
  ownershipFilter
} = {}) {
  assertVerifiedConnection(connection);
  if (!INTEGRATION_COLLECTION_ALLOWLIST.includes(collectionName)) {
    throw new Error("Fixture collection is outside the integration allowlist.");
  }
  if (!mongoose.isValidObjectId(id)) {
    throw new TypeError("A valid fixture document ID is required.");
  }
  if (!ownershipFilter || typeof ownershipFilter !== "object" || Array.isArray(ownershipFilter)) {
    throw new TypeError("Persisted fixture ownership fields are required.");
  }

  const allowedFields = FIXTURE_OWNER_FIELDS[collectionName];
  const fields = Object.keys(ownershipFilter);
  if (fields.some(field => !allowedFields.includes(field)) ||
      REQUIRED_OWNER_FIELDS[collectionName].some(field => !fields.includes(field))) {
    throw new TypeError("Fixture ownership fields do not meet the collection requirements.");
  }

  let byCollection = fixtureRegistrations.get(connection);
  if (!byCollection) {
    byCollection = new Map();
    fixtureRegistrations.set(connection, byCollection);
  }
  let byId = byCollection.get(collectionName);
  if (!byId) {
    byId = new Map();
    byCollection.set(collectionName, byId);
  }

  const objectId = id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
  const key = objectId.toHexString();
  if (byId.has(key)) throw new Error("Fixture ID is already registered for this test run.");
  const copiedFilter = Object.freeze(Object.fromEntries(
    fields.map(field => [field, copyOwnershipValue(ownershipFilter[field])])
  ));
  byId.set(key, Object.freeze({ id: objectId, ownershipFilter: copiedFilter }));
}

export async function cleanupIntegrationCollections({
  connection = mongoose.connection
} = {}) {
  assertVerifiedConnection(connection);

  const counts = {};
  const byCollection = fixtureRegistrations.get(connection) || new Map();
  for (const collectionName of INTEGRATION_COLLECTION_ALLOWLIST) {
    const byId = byCollection.get(collectionName);
    let deletedCount = 0;
    if (byId) {
      for (const [key, fixture] of [...byId.entries()]) {
        const fields = Object.keys(fixture.ownershipFilter);
        const collection = connection.db.collection(collectionName);
        const document = await collection.findOne(
          { _id: fixture.id },
          { projection: { _id: 1, ...Object.fromEntries(fields.map(field => [field, 1])) } }
        );
        if (!document) {
          byId.delete(key);
          continue;
        }
        const stillOwned = fields.every(field => {
          const expected = fixture.ownershipFilter[field];
          const actual = document[field];
          if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
          if (expected && typeof expected.toHexString === "function") {
            return actual != null && String(actual) === String(expected);
          }
          return actual === expected;
        });
        if (!stillOwned) {
          byId.delete(key);
          continue;
        }
        const result = await collection.deleteOne({ _id: fixture.id, ...fixture.ownershipFilter });
        deletedCount += result.deletedCount || 0;
        byId.delete(key);
      }
      if (byId.size === 0) byCollection.delete(collectionName);
    }
    counts[collectionName] = deletedCount;
  }
  if (byCollection.size === 0) fixtureRegistrations.delete(connection);
  return counts;
}

export async function teardownIntegrationDatabase({ client = mongoose } = {}) {
  const connection = client.connection;
  let cleanupFailure;
  try {
    if (verifiedConnections.has(connection)) {
      await cleanupIntegrationCollections({ connection });
    }
  } catch (error) {
    cleanupFailure = error;
  } finally {
    verifiedConnections.delete(connection);
    verifiedConnectionIdentity.delete(connection);
    if (connection.readyState !== 0) {
      await client.disconnect();
    }
  }
  if (cleanupFailure) throw cleanupFailure;
}

export async function withIntegrationDatabase(callback, options = {}) {
  if (typeof callback !== "function") {
    throw new TypeError("An integration-test callback is required.");
  }

  const client = options.client || mongoose;
  const connection = await setupIntegrationDatabase(options);
  try {
    await cleanupIntegrationCollections({ connection });
    return await callback(connection);
  } finally {
    await teardownIntegrationDatabase({ client });
  }
}


const REQUIRED_MODEL_NAMES = [
  "User",
  "ExpectedSubmission",
  "MetricSubmission"
];

const INDEX_SEMANTIC_OPTIONS = [
  "unique",
  "sparse",
  "expireAfterSeconds",
  "partialFilterExpression",
  "collation",
  "hidden",
  "wildcardProjection",
  "weights",
  "default_language",
  "language_override",
  "textIndexVersion",
  "2dsphereIndexVersion",
  "bits",
  "min",
  "max",
  "bucketSize",
  "storageEngine"
];

function createResult() {
  return {
    ready: false,
    topology: {
      type: "unknown"
    },
    checks: {
      connection: {
        verified: false
      },
      models: {
        verified: false
      },
      transactionTopology: {
        verified: false
      },
      indexes: {
        verified: false,
        models: {}
      }
    },
    errors: []
  };
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, normalize(value[key])])
    );
  }

  return value;
}

function valuesEqual(left, right) {
  return JSON.stringify(normalize(left)) ===
    JSON.stringify(normalize(right));
}

function indexKeysEqual(expected, actual) {
  if (
    !expected ||
    !actual ||
    typeof expected !== "object" ||
    typeof actual !== "object"
  ) {
    return false;
  }

  const expectedEntries = Object.entries(expected);
  const actualEntries = Object.entries(actual);

  if (expectedEntries.length !== actualEntries.length) {
    return false;
  }

  return expectedEntries.every(
    ([expectedField, expectedDirection], index) => {
      const [actualField, actualDirection] =
        actualEntries[index] || [];

      return (
        expectedField === actualField &&
        expectedDirection === actualDirection
      );
    }
  );
}

function getIndexName(key, options = {}) {
  if (options.name) {
    return options.name;
  }

  return Object.entries(key)
    .map(([field, direction]) => `${field}_${direction}`)
    .join("_");
}

function verifyIndexDefinition(expected, actual) {
  if (!actual) {
    return "Declared index is missing";
  }

  if (expected.name !== actual.name) {
    return "Index name does not match";
  }

  if (!indexKeysEqual(expected.key, actual.key)) {
    return "Index key definition does not match";
  }

  for (const option of INDEX_SEMANTIC_OPTIONS) {
    const expectedValue = expected.options[option];
    const actualValue = actual[option];

    if (option === "unique" || option === "sparse") {
      if (Boolean(expectedValue) !== Boolean(actualValue)) {
        return `Index option '${option}' does not match`;
      }

      continue;
    }

    if (
      expectedValue !== undefined ||
      actualValue !== undefined
    ) {
      if (!valuesEqual(expectedValue, actualValue)) {
        return `Index option '${option}' does not match`;
      }
    }
  }

  return null;
}

function verifyModels(connection, models, result) {
  if (
    !connection ||
    !connection.models ||
    !models ||
    typeof models !== "object"
  ) {
    result.errors.push(
      "Connection or model registry is unavailable"
    );

    return false;
  }

  const failures = [];

  for (const modelName of REQUIRED_MODEL_NAMES) {
    try {
      const expectedModel = models[modelName];

      if (
        typeof expectedModel !== "function" ||
        expectedModel.modelName !== modelName ||
        expectedModel.db !== connection ||
        connection.models[modelName] !== expectedModel
      ) {
        failures.push(
          `Required model '${modelName}' is missing or incorrectly registered`
        );
      }
    } catch (error) {
      failures.push(
        `Required model '${modelName}' verification failed: ${getErrorMessage(error)}`
      );
    }
  }

  result.checks.models = {
    verified: failures.length === 0
  };

  result.errors.push(...failures);

  return failures.length === 0;
}

async function verifyTopology(connection, result) {
  try {
    if (typeof connection.getClient !== "function") {
      throw new Error("MongoDB client is unavailable");
    }

    const client = connection.getClient();

    if (!client || typeof client.db !== "function") {
      throw new Error("MongoDB client database interface is unavailable");
    }

    const database = client.db();

    if (!database || typeof database.admin !== "function") {
      throw new Error("MongoDB admin interface is unavailable");
    }

    const admin = database.admin();

    if (!admin || typeof admin.command !== "function") {
      throw new Error("MongoDB command interface is unavailable");
    }

    const hello = await admin.command({ hello: 1 });

    if (!hello || typeof hello !== "object") {
      throw new Error("MongoDB returned an invalid hello response");
    }

    if (hello.msg === "isdbgrid") {
      result.topology = {
        type: "sharded"
      };

      result.checks.transactionTopology = {
        verified: false,
        reason:
          "Sharded transaction capability requires separate deployment verification"
      };

      result.errors.push(
        "Sharded topology identified, but transaction capability has not been independently verified"
      );

      return;
    }

    if (
      typeof hello.setName === "string" &&
      hello.setName.length > 0
    ) {
      result.topology = {
        type: "replicaSet",
        setName: hello.setName,
        primary: hello.primary || null
      };

      if (hello.isWritablePrimary !== true) {
        result.checks.transactionTopology = {
          verified: false,
          reason:
            "Connected replica-set member is not the writable primary"
        };

        result.errors.push(
          "Replica-set primary verification failed"
        );

        return;
      }

      result.checks.transactionTopology = {
        verified: true
      };

      return;
    }

    if (hello.isWritablePrimary === true) {
      result.topology = {
        type: "standalone"
      };

      result.errors.push(
        "Standalone MongoDB does not support the required multi-document transaction topology"
      );

      return;
    }

    result.topology = {
      type: "unknown"
    };

    result.errors.push(
      "MongoDB topology could not be classified from the hello response"
    );
  } catch (error) {
    result.topology = {
      type: "unknown"
    };

    result.errors.push(
      `MongoDB topology verification failed: ${getErrorMessage(error)}`
    );
  }
}

async function verifyIndexes(models, result) {
  let allVerified = true;

  for (const modelName of REQUIRED_MODEL_NAMES) {
    const Model = models[modelName];

    const modelResult = {
      verified: false,
      collection: null,
      indexes: []
    };

    result.checks.indexes.models[modelName] = modelResult;

    try {
      if (
        !Model ||
        !Model.schema ||
        typeof Model.schema.indexes !== "function" ||
        !Model.collection ||
        typeof Model.collection.listIndexes !== "function"
      ) {
        throw new Error(
          "Model schema or collection metadata is unavailable"
        );
      }

      modelResult.collection =
        Model.collection.collectionName ?? null;

      if (
        typeof modelResult.collection !== "string" ||
        modelResult.collection.length === 0
      ) {
        throw new Error(
          "Model collection name is unavailable"
        );
      }

      const declaredIndexes = Model.schema.indexes().map(
        ([key, options]) => ({
          name: getIndexName(key, options),
          key,
          options
        })
      );

      if (declaredIndexes.length === 0) {
        throw new Error(
          "No declared indexes found for required model"
        );
      }

      const cursor = await Model.collection.listIndexes();

      if (!cursor || typeof cursor.toArray !== "function") {
        throw new Error(
          "MongoDB returned an invalid index cursor"
        );
      }

      const actualIndexes = await cursor.toArray();

      if (!Array.isArray(actualIndexes)) {
        throw new Error(
          "MongoDB returned an invalid index inventory"
        );
      }

      for (const expected of declaredIndexes) {
        const actual = actualIndexes.find(
          index => index.name === expected.name
        );

        const mismatch = verifyIndexDefinition(
          expected,
          actual
        );

        if (mismatch) {
          modelResult.indexes.push({
            name: expected.name,
            verified: false,
            reason: mismatch
          });

          result.errors.push(
            `${modelName}: ${expected.name} - ${mismatch}`
          );

          continue;
        }

        modelResult.indexes.push({
          name: expected.name,
          verified: true
        });
      }

      modelResult.verified =
        modelResult.indexes.length === declaredIndexes.length &&
        modelResult.indexes.every(index => index.verified);

    } catch (error) {
      modelResult.verified = false;

      result.errors.push(
        `${modelName}: index inspection failed: ${getErrorMessage(error)}`
      );
    }

    if (!modelResult.verified) {
      allVerified = false;
    }
  }

  result.checks.indexes.verified = allVerified;
}

export function createDailySubmissionInfrastructureVerifier({
  connection,
  models
} = {}) {
  return async function verifyDailySubmissionInfrastructure() {
    const result = createResult();

    if (!connection || connection.readyState !== 1) {
      result.errors.push(
        "Database connection is not ready"
      );

      return result;
    }

    result.checks.connection.verified = true;

    const modelsVerified = verifyModels(
      connection,
      models,
      result
    );

    if (!modelsVerified) {
      return result;
    }

    await verifyTopology(connection, result);

    await verifyIndexes(models, result);

    result.ready =
      result.checks.connection.verified &&
      result.checks.models.verified &&
      result.checks.transactionTopology.verified &&
      result.checks.indexes.verified &&
      result.errors.length === 0;

    return result;
  };
}

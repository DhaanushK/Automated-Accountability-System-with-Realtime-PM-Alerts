
const EXPECTED_DATABASE = "accountability_app_integration_test";
const COLLECTION = "submission_access_grants";

const EXPECTED_INDEXES = [
  {
    name: "uniq_active_user_access_scope",
    key: { userId: 1, scope: 1 },
    unique: true,
    partialFilterExpression: { active: true }
  },
  {
    name: "user_access_grant_history",
    key: { userId: 1, grantedAt: -1 },
    unique: false
  }
];

function sameEntries(a, b) {
  const left = Object.entries(a || {});
  const right = Object.entries(b || {});

  return left.length === right.length &&
    left.every(([key, value], index) =>
      key === right[index][0] && value === right[index][1]
    );
}

if (db.getName() !== EXPECTED_DATABASE) {
  throw new Error("Unexpected database. Verification stopped.");
}

const collections = db.getCollectionInfos({
  name: COLLECTION
});

if (collections.length !== 1) {
  throw new Error("Expected collection does not exist.");
}

const actualIndexes = db.getCollection(COLLECTION).getIndexes();

for (const expected of EXPECTED_INDEXES) {
  const actual = actualIndexes.find(
    index => index.name === expected.name
  );

  if (!actual) {
    throw new Error(`Missing index: ${expected.name}`);
  }

  if (
    !sameEntries(actual.key, expected.key) ||
    (actual.unique === true) !== expected.unique
  ) {
    throw new Error(`Index definition mismatch: ${expected.name}`);
  }

  if (
    expected.partialFilterExpression &&
    !sameEntries(
      actual.partialFilterExpression,
      expected.partialFilterExpression
    )
  ) {
    throw new Error(
      `Partial filter mismatch: ${expected.name}`
    );
  }

  if (
    !expected.partialFilterExpression &&
    actual.partialFilterExpression !== undefined
  ) {
    throw new Error(
      `Unexpected partial filter: ${expected.name}`
    );
  }

  print(`VERIFIED: ${expected.name}`);
}

print("COLLECTION VERIFIED:", COLLECTION);
print("DATABASE VERIFIED:", EXPECTED_DATABASE);
print("RESULT: ALL INDEXES VERIFIED");

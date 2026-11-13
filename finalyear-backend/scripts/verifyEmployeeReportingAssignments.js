const expectedDb = "accountability_app_integration_test";
const expectedCollection = "employee_reporting_assignments";

print("=== READ-ONLY ASSIGNMENT DATABASE VERIFICATION ===");

if (db.getName() !== expectedDb) {
  throw new Error("Unexpected database. Verification stopped.");
}

const hello = db.adminCommand({ hello: 1 });

if (
  hello.setName !== "accountabilityTestRS" ||
  hello.me !== "127.0.0.1:27018"
) {
  throw new Error("Unexpected MongoDB server or replica set.");
}

print("DATABASE:", db.getName());
print("SERVER:", hello.me);
print("REPLICA SET:", hello.setName);

const collectionInfo = db.getCollectionInfos({
  name: expectedCollection
});

if (collectionInfo.length === 0) {
  print("COLLECTION STATUS: NOT CREATED");
  print("DOCUMENT COUNT: NOT APPLICABLE");
  print("INDEX STATUS: NOT APPLICABLE");
} else {
  print("COLLECTION STATUS: EXISTS");

  const collection = db.getCollection(expectedCollection);
  const indexes = collection.getIndexes();
  const count = collection.countDocuments({});

  print("DOCUMENT COUNT:", count);
  print("EXISTING INDEXES:");
  printjson(indexes);

  const uniqueStart = indexes.find(index =>
    index.name === "uniq_employee_assignment_start"
  );

  const teamLeadHistory = indexes.find(index =>
    index.name === "team_lead_assignment_history"
  );

  const redundantHistory = indexes.find(index =>
    index.name === "employee_assignment_history"
  );

  print("UNIQUE EMPLOYEE/START INDEX:",
    Boolean(
      uniqueStart &&
      uniqueStart.unique === true &&
      uniqueStart.key.employeeId === 1 &&
      uniqueStart.key.effectiveStartDate === 1
    )
  );

  print("TEAM LEAD HISTORY INDEX:",
    Boolean(
      teamLeadHistory &&
      teamLeadHistory.key.teamLeadId === 1 &&
      teamLeadHistory.key.teamId === 1 &&
      teamLeadHistory.key.effectiveStartDate === -1
    )
  );

  print("REDUNDANT EMPLOYEE HISTORY INDEX PRESENT:",
    Boolean(redundantHistory)
  );
}

print("=== VERIFICATION COMPLETE ===");

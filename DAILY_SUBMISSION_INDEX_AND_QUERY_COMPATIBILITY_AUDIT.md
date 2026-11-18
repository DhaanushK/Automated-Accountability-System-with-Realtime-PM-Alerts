# Daily Submission Index and Query Compatibility Audit

**Audit date:** 16 November 2026\
**Scope:** Source-declared indexes, reviewed query shapes, and the
supplied local MongoDB index inspection\
**Status:** Read-only audit; no index or data changes performed

## 1. Executive summary

This audit maps the indexes declared by `ExpectedSubmission`,
`MetricSubmission`, and `SubmissionPolicy` to the query shapes
identified in the reviewed backend services.

The source declares eight secondary indexes across these three
collections:

-   `expected_submissions`: 3
-   `metric_submissions`: 3
-   `submission_policies`: 2

The supplied local inspection for `127.0.0.1:27017/finalyear_metrics`
reported only the standard `_id_` index for each of these three
collections. Therefore, the eight declared secondary indexes were not
present in that inspected local database at the time of inspection.

This is a local-environment observation only. It does not establish the
state of any staging or production database.

The current connection configuration sets `autoIndex: false`.
Consequently, schema declarations must not be treated as proof that
indexes have been provisioned in a running database. Index provisioning
must be handled through an explicitly approved process and verified
independently.

No index was created, rebuilt, dropped, or migrated during this audit.
No documents were changed.

## 2. Evidence basis and limitations

This audit is based on:

1.  The supplied model definitions for `ExpectedSubmission`,
    `MetricSubmission`, and `SubmissionPolicy`.
2.  The reviewed query excerpts from `dailySubmissionReadService.js`,
    `dailySubmissionWriteService.js`, and `submissionPolicyService.js`.
3.  The supplied broad source/scripts query-usage search output.
4.  The supplied local `listIndexes` inspection summary for
    `finalyear_metrics`.
5.  The existing infrastructure evidence and production evidence-plan
    documents.

### Evidence boundaries

-   The source declares intended index definitions; it does not prove
    that a database contains them.
-   The local `listIndexes` result is evidence only for the inspected
    local database and collection metadata.
-   The production MongoDB environment, version, topology, database
    identity, and live index state remain unverified.
-   The final full `src` and `scripts` usage scan requested after the
    initial query review has not yet been supplied. Accordingly, indexes
    not matched by the reviewed service excerpts are classified as **not
    demonstrated in the reviewed query set**, not definitively unused
    across the entire application.
-   No representative `explain()` plan or workload/SLO evidence was
    supplied. Performance conclusions are therefore reasoned
    assessments, not measured query-plan results.
-   The retained evidence reviewed for this report does not include a
    captured `buildInfo` result, collection document counts, or
    authorization-status output. Those details are left unverified
    rather than inferred.

## 3. Declared index inventory

### 3.1 ExpectedSubmission --- `expected_submissions`

  --------------------------------------------------------------------------------------------------------------------------------
  Index name                                 Ordered key                                            Unique Assessment
  ------------------------------------------ --------------------------------------- --------------------- -----------------------
  `uniq_expected_submission_employee_date`   `{ employeeId: 1, reportingDate: 1 }`                     Yes Essential for
                                                                                                           employee/date
                                                                                                           uniqueness and
                                                                                                           employee-specific reads

  `expected_submission_date_status`          `{ reportingDate: 1, status: 1 }`                          No Operational/reporting
                                                                                                           candidate; exact
                                                                                                           status-filter usage not
                                                                                                           demonstrated in the
                                                                                                           reviewed read-service
                                                                                                           excerpts

  `expected_submission_due_status`           `{ status: 1, deadlineAt: 1 }`                             No Due/status processing
                                                                                                           candidate; matching
                                                                                                           query usage still needs
                                                                                                           confirmation from the
                                                                                                           final full
                                                                                                           source/scripts scan
  --------------------------------------------------------------------------------------------------------------------------------

### 3.2 MetricSubmission --- `metric_submissions`

  --------------------------------------------------------------------------------------------------------------------------
  Index name                               Ordered key                                             Unique Assessment
  ---------------------------------------- ---------------------------------------- --------------------- ------------------
  `uniq_metric_submission_employee_date`   `{ employeeId: 1, reportingDate: 1 }`                      Yes Essential for
                                                                                                          employee/date
                                                                                                          lookup and
                                                                                                          duplicate
                                                                                                          protection

  `metric_submission_date_status`          `{ reportingDate: 1, status: 1 }`                           No Reporting/status
                                                                                                          candidate;
                                                                                                          matching query
                                                                                                          usage not
                                                                                                          demonstrated in
                                                                                                          the reviewed
                                                                                                          service excerpts

  `metric_submission_employee_history`     `{ employeeId: 1, reportingDate: -1 }`                      No Potentially
                                                                                                          redundant for the
                                                                                                          reviewed
                                                                                                          employee/date
                                                                                                          access pattern;
                                                                                                          retain pending
                                                                                                          full query and
                                                                                                          plan review
  --------------------------------------------------------------------------------------------------------------------------

### 3.3 SubmissionPolicy --- `submission_policies`

  ---------------------------------------------------------------------------------------------------------------------------------------
  Index name                         Ordered key                                                                  Unique Assessment
  ---------------------------------- ------------------------------------------------------------- --------------------- ----------------
  `uniq_submission_policy_version`   `{ policyVersion: 1 }`                                                          Yes Essential for
                                                                                                                         policy-version
                                                                                                                         lookup and
                                                                                                                         uniqueness

  `submission_policy_effectivity`    `{ active: 1, effectiveStartDate: 1, effectiveEndDate: 1 }`                      No Supports the
                                                                                                                         active-policy
                                                                                                                         effectivity
                                                                                                                         lookup in part;
                                                                                                                         does not
                                                                                                                         naturally cover
                                                                                                                         the overlap
                                                                                                                         lookup that
                                                                                                                         omits `active`
  ---------------------------------------------------------------------------------------------------------------------------------------

## 4. Query-to-index compatibility

### 4.1 ExpectedSubmission queries

  ----------------------------------------------------------------------------------------
  Query shape identified                   Existing index          Assessment
                                           relationship            
  ---------------------------------------- ----------------------- -----------------------
  `{ employeeId, reportingDate }` for      Exact equality match on Strong match
  own-day/expected-row lookup              the unique              
                                           employee/date index     

  Employee-specific reporting-date range,  Employee equality       Strong match
  sorted by `reportingDate: -1`            followed by             
                                           reporting-date range;   
                                           the ascending compound  
                                           index can be traversed  
                                           in reverse for the date 
                                           ordering when           
                                           employeeId is fixed     

  Same employee/date range with authorized Same leading            Strong candidate;
  date intervals expressed as `$or`        employee/date key       confirm with
                                           pattern; each           `explain()` using
                                           authorized interval can representative
                                           use the employee/date   intervals
                                           index bounds            

  Exact `reportingDate`, sorted by         The date/status index   Partial filter support
  `employeeId: 1`                          has a leading           only; sort coverage not
                                           reportingDate field but established
                                           does not contain        
                                           employeeId; it cannot   
                                           by itself provide the   
                                           complete requested      
                                           employee sort           

  Organization-wide reporting-date range,  No declared             Candidate for a
  sorted by                                ExpectedSubmission      dedicated compound
  `{ reportingDate: -1, employeeId: 1 }`   index has this ordered  index if query-plan and
                                           key pattern             latency evidence
                                                                   justify it
  ----------------------------------------------------------------------------------------

#### Organization-wide index candidate

The reviewed query is:

``` javascript
ExpectedSubmission.find({
  reportingDate: { $gte: fromDate, $lte: toDate }
}).sort({
  reportingDate: -1,
  employeeId: 1
});
```

A candidate for measured evaluation is:

``` javascript
{ reportingDate: -1, employeeId: 1 }
```

This is not an instruction to create the index. Validate the candidate
with representative data volume, query plans, pagination behavior, and
the applicable latency target before proposing a migration.

### 4.2 MetricSubmission queries

  ---------------------------------------------------------------------------------
  Query shape identified            Existing index          Assessment
                                    relationship            
  --------------------------------- ----------------------- -----------------------
  Lookup by                         Exact match on the      Strong match
  `{ employeeId, reportingDate }`   unique employee/date    
                                    index                   

  Linked-submission integrity       `_id_` narrows to the   `_id_` supports the
  lookup by `_id`, employeeId, and  document; remaining     lookup; compound unique
  reportingDate                     fields validate the     index remains the
                                    relationship            employee/date integrity
                                                            constraint

  Lookup by `_id`                   Standard `_id_` index   Strong match
  ---------------------------------------------------------------------------------

The declared history index `{ employeeId: 1, reportingDate: -1 }` is not
demonstrated as necessary by the reviewed MetricSubmission query
excerpts. For a fixed employeeId, the unique
`{ employeeId: 1, reportingDate: 1 }` index can be traversed in reverse
to return reportingDate descending. This makes the history index a
**redundancy-review candidate**, not an index to drop automatically.

Do not remove it without checking the complete query inventory, query
plans, index usage statistics, and operational workloads outside the
reviewed self-service read path.

### 4.3 SubmissionPolicy queries

  -----------------------------------------------------------------------------------------
  Query shape identified                   Existing index           Assessment
                                           relationship             
  ---------------------------------------- ------------------------ -----------------------
  `{ policyVersion }` historical policy    Exact equality match on  Strong match
  lookup                                   unique                   
                                           `{ policyVersion: 1 }`   

  Active effective policy: `active: true`, Compound index begins    Relevant index; confirm
  `effectiveStartDate <= reportingDate`,   with equality on         with `explain()`
  and end-date `$or`                       `active`, followed by    
                                           `effectiveStartDate`;    
                                           trailing                 
                                           `effectiveEndDate` may   
                                           have limited use because 
                                           of the range and `$or`   
                                           structure                

  Overlap validation:                      Compound index begins    Not a natural
  `effectiveStartDate <= date` and         with `active`, which is  leading-key match;
  end-date `$or`, with no `active`         not constrained by this  collection size and
  predicate                                query                    query plans determine
                                                                    whether another index
                                                                    is warranted
  -----------------------------------------------------------------------------------------

The overlap-validation query intentionally considers effective policy
versions without filtering on `active`. Do not change that query's
semantics merely to make it align with the compound index.

## 5. Local index inspection result

**Inspected target:** `127.0.0.1:27017/finalyear_metrics`\
**Inspection type:** Read-only index metadata inspection\
**Reported result:** Each of the following collections showed only the
standard `_id_` index.

  ----------------------------------------------------------------------------
  Collection                      Declared secondary         Secondary indexes
                                             indexes          reported locally
  ------------------------ ------------------------- -------------------------
  `expected_submissions`                           3                         0

  `metric_submissions`                             3                         0

  `submission_policies`                            2                         0

  **Total**                                    **8**                     **0**
  ----------------------------------------------------------------------------

### Interpretation

-   The eight model-declared secondary indexes were absent from the
    inspected local database at the time of the supplied inspection.
-   This does not prove the collections are missing indexes in another
    database or deployment.
-   This does not establish whether any production data would permit
    creation of the unique indexes.
-   No duplicate-data scan or repair was performed or authorized.
-   The local result is not production evidence.

The earlier Step 5C evidence record separately states that test-database
index state was not verified during that test exercise. This later local
inspection should be retained as a distinct observation, not
retroactively represented as Step 5C evidence.

## 6. Mongoose configuration and provisioning implications

The current `src/config/db.js` configuration sets:

``` javascript
autoIndex: false
```

This is a deliberate safety setting: Mongoose should not be relied upon
to automatically create the declared indexes during application
connection/startup.

The model declarations describe intended index definitions. They do not
provision those indexes by themselves under this configuration.

The inspected `scripts/migrations` directory contains migrations for
User employee-code, reporting-assignment, and submission-access-grant
indexes. No dedicated migration for the ExpectedSubmission or
MetricSubmission indexes was identified in the inspected directory. The
two SubmissionPolicy indexes also need an explicit provisioning-owner
decision; no dedicated policy-index migration was identified in the
reviewed migration inventory.

Before any deployment, the responsible owner should establish: - which
controlled process provisions these model indexes; - which
environment/database it targets; - how unique-index preconditions and
duplicate-data risks are assessed; - how index creation is reviewed,
scheduled, monitored, and rolled back where applicable; and - how the
resulting definitions are independently verified.

This audit does not authorize a migration or index operation.

## 7. Recommended verification procedure

After an environment has been explicitly identified and approved, a
DBA/deployment owner should perform a read-only comparison against that
exact target.

For each relevant collection, capture: 1. Environment and database
identity, without credentials or raw connection strings. 2. Collection
name. 3. Index name. 4. Ordered key fields and directions. 5. `unique`
setting. 6. Partial filter, sparse, collation, TTL, hidden, and other
relevant options. 7. Any equivalent key pattern under a different name.
8. Collection time, collector, reviewer, and sanitized evidence
reference.

Required unique-index definitions for the daily-submission
data-integrity path:

  -----------------------------------------------------------------------------------------------------------------------------
  Collection               Required index                             Required key                            Required option
  ------------------------ ------------------------------------------ --------------------------------------- -----------------
  `expected_submissions`   `uniq_expected_submission_employee_date`   `{ employeeId: 1, reportingDate: 1 }`   `unique: true`

  `metric_submissions`     `uniq_metric_submission_employee_date`     `{ employeeId: 1, reportingDate: 1 }`   `unique: true`

  `submission_policies`    `uniq_submission_policy_version`           `{ policyVersion: 1 }`                  `unique: true`
  -----------------------------------------------------------------------------------------------------------------------------

The SubmissionPolicy unique index is included because the write/read
policy path looks up historical policy versions by `policyVersion` and
relies on version uniqueness.

A missing, differently ordered, duplicate, hidden, or otherwise
incompatible required index must be reported as a readiness blocker for
the relevant operation. Do not create, rebuild, drop, or repair indexes
during this read-only verification.

## 8. Outstanding evidence and decisions

  -----------------------------------------------------------------------
  Item                    Current status          Required next evidence
  ----------------------- ----------------------- -----------------------
  Full source/scripts     Pending                 Complete `src` and
  index-usage scan                                `scripts` search;
                                                  classify actual queries
                                                  separately from
                                                  schemas, comments,
                                                  tests, and field
                                                  mentions

  ExpectedSubmission      Not measured            Representative
  organization-wide query                         `explain()` output and
  plan                                            latency/SLO assessment

  SubmissionPolicy        Not measured            Representative
  effectivity query plan                          `explain()` output

  SubmissionPolicy        Not measured            Representative
  overlap query                                   `explain()` output and
  performance                                     collection-size context

  Local secondary-index   Not performed           Approved local
  provisioning                                    provisioning decision,
                                                  if needed

  Production environment  Unknown                 Approved deployment
  identity                                        inventory and
                                                  accountable owner

  Production MongoDB      Unknown                 Sanitized DBA/provider
  version/topology                                metadata

  Production index state  Unknown                 Read-only `listIndexes`
                                                  comparison on the
                                                  explicitly approved
                                                  target

  Production transaction  Unknown                 Approved representative
  capability                                      non-production
                                                  transaction evidence

  Production deployment   Not established         Operational, security,
  readiness                                       monitoring,
                                                  backup/recovery, and
                                                  release sign-off
  -----------------------------------------------------------------------

## 9. Safety and scope confirmation

-   No production or staging database was accessed.
-   No index was created, rebuilt, dropped, or migrated.
-   No collection or document was modified.
-   No duplicate scan, data cleanup, or repair was performed.
-   No application source or configuration was modified as part of this
    audit.
-   The existing Daily Submission endpoint activation decision remains
    separate. This report does not authorize enabling any endpoint.
-   Existing legacy metrics, ticket, Google Sheets, email, scheduler,
    and alert workflows remain outside the scope of this index audit.

## 10. Final assessment

The unique employee/date indexes on `ExpectedSubmission` and
`MetricSubmission`, and the unique policy-version index on
`SubmissionPolicy`, align with the core identity and lookup requirements
identified in the reviewed services.

The additional reporting/status and deadline indexes require
confirmation against the complete application query inventory. The
MetricSubmission descending history index appears potentially redundant
for the reviewed employee-specific access pattern, but should not be
removed without full workload evidence.

The organization-wide ExpectedSubmission range query has a sort pattern
not directly represented by the declared indexes. A
`{ reportingDate: -1, employeeId: 1 }` index is a candidate for measured
evaluation only.

The local inspection reported all eight declared secondary indexes
absent from the inspected local database. Because automatic index
creation is disabled, an explicit, controlled provisioning and
verification process is needed before relying on these declarations in
any target environment.

**Overall status: Source/query compatibility review completed for the
supplied excerpts; full source/scripts usage scan and production
infrastructure verification remain outstanding.**

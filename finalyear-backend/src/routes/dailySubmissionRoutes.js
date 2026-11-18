import express from "express";
import { authMiddleware, authorizeRoles } from "../middleware/auth.js";
import { dailySubmissionController } from "../controllers/dailySubmissionController.js";
import {
  createSubmissionStoreReadinessGuard,
  validateSubmissionRequest,
  validateSubmissionId
} from "../services/dailySubmissionService.js";
import {
  assertActiveTeamMember,
  getAuthenticatedUserId,
  loadSubmissionActor
} from "../services/submissionAccessService.js";
import {
  validateNoReadQueryParameters,
  validateReadHistoryQuery,
  validateReadReportingDate
} from "../services/dailySubmissionReadRequestValidation.js";

const SUPPORTED_ROLES = ["team_member", "team_lead", "project_manager"];

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}

function validateReadRequest(validator, handler) {
  return asyncRoute((req, res, next) => {
    validator(req);
    return handler(req, res, next);
  });
}

export function createDailySubmissionRouter({
  isStoreReady,
  clock = () => new Date(),
  actorLoader = loadSubmissionActor,
  controllers = dailySubmissionController
} = {}) {
  const router = express.Router();
  const readinessGuard = createSubmissionStoreReadinessGuard(
    isStoreReady ? { isReady: isStoreReady } : undefined
  );

  router.use((req, res, next) => {
    req.standardApiErrors = true;
    next();
  });
  router.use(readinessGuard);
  router.use(authMiddleware);

  router.post(
    "/",
    authorizeRoles("team_member"),
    asyncRoute(async (req, res, next) => {
      const request = validateSubmissionRequest(req.body, { clock });
      const userId = getAuthenticatedUserId(req.user);
      const actor = assertActiveTeamMember(await actorLoader(userId));
      req.validatedSubmission = request;
      req.submissionActor = actor;
      return controllers.submit(req, res, next);
    })
  );

  router.get(
    "/me/history",
    authorizeRoles("team_member"),
    validateReadRequest(req => {
      req.validatedReadQuery = validateReadHistoryQuery(req.query);
    }, controllers.getHistory)
  );

  router.get(
    "/me/current",
    authorizeRoles("team_member"),
    validateReadRequest(req => {
      req.validatedReadQuery = validateNoReadQueryParameters(req.query);
    }, controllers.getCurrent)
  );

  router.get(
    "/me/:reportingDate",
    authorizeRoles("team_member"),
    validateReadRequest(req => {
      req.validatedReportingDate = validateReadReportingDate(
        req.params.reportingDate
      );
      req.validatedReadQuery = validateNoReadQueryParameters(req.query);
    }, controllers.getOwnDay)
  );

  router.get(
    "/:submissionId",
    authorizeRoles(...SUPPORTED_ROLES),
    (req, res, next) => {
      try {
        validateSubmissionId(req.params.submissionId);
        return controllers.getDetail(req, res, next);
      } catch (error) {
        return next(error);
      }
    }
  );

  return router;
}

export default createDailySubmissionRouter();

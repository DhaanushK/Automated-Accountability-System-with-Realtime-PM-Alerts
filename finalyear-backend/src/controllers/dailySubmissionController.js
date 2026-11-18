import { getAuthenticatedUserId } from "../services/submissionAccessService.js";

export function respondNotImplemented(res, operation) {
  return res.status(501).json({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: operation + " is not enabled in this implementation stage."
    }
  });
}

export function createDailySubmissionController({
  readService,
  clock = () => new Date(),
  enableSelfServiceReads = false
} = {}) {
  const controller = {
    submit(req, res) {
      return respondNotImplemented(res, "Daily metric submission writes");
    },

    getOwnDay(req, res) {
      return respondNotImplemented(res, "Daily submission lookup");
    },

    getCurrent(req, res) {
      return respondNotImplemented(res, "Current reporting-day lookup");
    },

    getHistory(req, res) {
      return respondNotImplemented(res, "Daily submission history");
    },

    getDetail(req, res) {
      return respondNotImplemented(res, "Submission detail lookup");
    }
  };

  if (!enableSelfServiceReads) {
    return controller;
  }

  const requiredMethods = [
    "getOwnDay",
    "getOwnCurrent",
    "getOwnHistory"
  ];

  for (const method of requiredMethods) {
    if (typeof readService?.[method] !== "function") {
      throw new TypeError(
        `Self-service reads require readService.${method}().`
      );
    }
  }

  return {
    ...controller,

    async getOwnDay(req, res) {
      const result = await readService.getOwnDay({
        authenticatedUserId: getAuthenticatedUserId(req.user),
        reportingDate: req.validatedReportingDate,
        clock
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    },

    async getCurrent(req, res) {
      const result = await readService.getOwnCurrent({
        authenticatedUserId: getAuthenticatedUserId(req.user),
        clock
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    },

    async getHistory(req, res) {
      const result = await readService.getOwnHistory({
        authenticatedUserId: getAuthenticatedUserId(req.user),
        fromDate: req.validatedReadQuery.fromDate,
        toDate: req.validatedReadQuery.toDate,
        page: req.validatedReadQuery.page,
        limit: req.validatedReadQuery.limit,
        clock
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    }
  };
}

export const dailySubmissionController = createDailySubmissionController();

export function respondNotImplemented(res, operation) {
  return res.status(501).json({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: operation + " is not enabled in this implementation stage."
    }
  });
}

export function createDailySubmissionController() {
  return {
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
}

export const dailySubmissionController = createDailySubmissionController();

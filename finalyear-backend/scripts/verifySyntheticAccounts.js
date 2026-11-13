db.users.aggregate([
  {
    $match: {
      employeeCode: {
        $in: [
          "PM-001", "TL-001", "TL-002",
          "EMP-001", "EMP-002", "EMP-003",
          "EMP-004", "EMP-005", "EMP-006"
        ]
      }
    }
  },
  {
    $lookup: {
      from: "users",
      localField: "managerId",
      foreignField: "_id",
      as: "manager"
    }
  },
  {
    $unwind: {
      path: "$manager",
      preserveNullAndEmptyArrays: true
    }
  },
  {
    $project: {
      _id: 0,
      employeeCode: 1,
      name: 1,
      role: 1,
      active: 1,
      teamId: 1,
      managerCode: "$manager.employeeCode",
      employmentStartDate: 1,
      employmentEndDate: 1
    }
  },
  {
    $sort: {
      employeeCode: 1
    }
  }
]).forEach(doc => printjson(doc));

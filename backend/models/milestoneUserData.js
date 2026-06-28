// Milestone User Data Models
class MilestoneGoal {
    constructor(id, userId, name, targetAmount, deadline) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.targetAmount = targetAmount;
        this.deadline = deadline;
    }
}

class Milestone {
    constructor(id, userId, goalId, name, targetAmount, achievedAmount, achieved, deadline) {
        this.id = id;
        this.userId = userId;
        this.goalId = goalId;
        this.name = name;
        this.targetAmount = targetAmount;
        this.achievedAmount = achievedAmount || 0;
        this.achieved = achieved || false;
        this.deadline = deadline;
    }
}

module.exports = {
    MilestoneGoal,
    Milestone
};

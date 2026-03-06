// Milestone Utility Functions
function generateMilestones(goals) {
    // Break each goal into 3-5 milestones
    const milestones = [];
    goals.forEach(goal => {
        const step = Math.ceil(goal.targetAmount / 5);
        for (let i = 1; i <= 5; i++) {
            milestones.push({
                goalId: goal.id,
                name: `${goal.name} Milestone ${i}`,
                targetAmount: step * i,
                achievedAmount: 0,
                achieved: false,
                deadline: goal.deadline
            });
        }
    });
    return milestones;
}

function getProgressFeedback(goals, milestones) {
    // Provide feedback and celebration notifications
    return milestones.map(m => {
        let percent = (m.achievedAmount / m.targetAmount) * 100;
        let message = percent >= 100 ? `🎉 Milestone achieved: ${m.name}!` : `Progress: ${percent.toFixed(1)}% for ${m.name}`;
        return {
            milestoneId: m.id,
            message,
            celebrate: percent >= 100
        };
    });
}

module.exports = {
    generateMilestones,
    getProgressFeedback
};

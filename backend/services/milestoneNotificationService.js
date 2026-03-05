// Milestone Notification Service
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-email-password'
    }
});

function sendMilestoneNotification(userId, message) {
    // In a real system, fetch user email from DB
    const userEmail = getUserEmail(userId);
    const mailOptions = {
        from: 'your-email@gmail.com',
        to: userEmail,
        subject: 'Milestone Achievement Notification',
        text: message
    };
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log('Error sending milestone notification:', error);
        } else {
            console.log('Milestone notification sent:', info.response);
        }
    });
}

function getUserEmail(userId) {
    // Placeholder: Replace with DB lookup
    return 'user' + userId + '@example.com';
}

module.exports = {
    sendMilestoneNotification
};

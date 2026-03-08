const { v4: uuidv4 } = require('uuid');

// In-memory store for scheduled meetings
const scheduled = [];

function scheduleMeeting(datetimeStr, emailsStr) {
  const meetingTime = new Date(datetimeStr);
  if (isNaN(meetingTime.getTime())) {
    throw new Error('Invalid date/time format');
  }
  
  // Ensure meeting is scheduled in the future
  if (meetingTime <= new Date()) {
    throw new Error('Meeting time must be in the future');
  }

  // Generate a meeting ID
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let meetingId = '';
  for (let i = 0; i < 4; i++) meetingId += chars[Math.floor(Math.random() * chars.length)];
  meetingId += '-';
  for (let i = 0; i < 4; i++) meetingId += chars[Math.floor(Math.random() * chars.length)];

  scheduled.push({
    meetingId,
    time: meetingTime,
    emails: emailsStr,
    reminderSent: false,
    createdAt: Date.now()
  });

  console.log(`[Schedule] Meeting ${meetingId} scheduled for ${meetingTime.toISOString()}`);
  return meetingId;
}

function getUpcomingMeetings() {
  return scheduled.filter(m => !m.reminderSent && m.time > new Date());
}

function markReminderSent(meetingId) {
  const mtg = scheduled.find(m => m.meetingId === meetingId);
  if (mtg) mtg.reminderSent = true;
}

function getMeetingRules(meetingId) {
  const mtg = scheduled.find(m => m.meetingId === meetingId);
  if (!mtg) return null;

  // Define allowed window (e.g., 10 minutes before, 60 minutes after scheduled time)
  const notBefore = new Date(mtg.time.getTime() - 10 * 60 * 1000); // 10 mins before
  const notAfter = new Date(mtg.time.getTime() + 60 * 60 * 1000);  // 60 mins after (default duration)
  
  return {
      scheduledTime: mtg.time,
      notBefore,
      notAfter
  };
}

module.exports = {
  scheduleMeeting,
  getUpcomingMeetings,
  markReminderSent,
  getMeetingRules
};

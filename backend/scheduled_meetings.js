const { v4: uuidv4 } = require('uuid');

// In-memory store for scheduled meetings
const scheduled = [];

function scheduleMeeting(datetimeStr, emailsStr) {
  const meetingTime = new Date(datetimeStr);
  if (isNaN(meetingTime.getTime())) {
    throw new Error('Invalid date/time format');
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

module.exports = {
  scheduleMeeting,
  getUpcomingMeetings,
  markReminderSent
};

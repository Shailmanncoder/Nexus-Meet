const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json()); // Need to parse JSON body for API
app.use(express.static(path.join(__dirname, '../frontend')));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Import the signaling logic
const initSignaling = require('./signaling');
initSignaling(io);

// === SCHEDULING API ===
const scheduledMeetings = require('./scheduled_meetings');
const { sendReminderEmail } = require('./mailer');
const cron = require('node-cron');

// API Endpoint to schedule a meeting
app.post('/api/schedule', (req, res) => {
  try {
    const { date, time, emails, security } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Date and time required' });

    // Combine into parseable date string
    const datetimeStr = `${date}T${time}`;
    const meetingId = scheduledMeetings.scheduleMeeting(datetimeStr, emails || '', security || 'open');

    res.json({ success: true, meetingId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoint to check meeting info (validation and presence)
const meetings = require('./meeting');

app.get('/api/meeting-info/:meetingId', (req, res) => {
  const meetingId = req.params.meetingId;
  
  // Check strict scheduling constraints first
  const scheduleRules = scheduledMeetings.getMeetingRules(meetingId);
  if (scheduleRules) {
      const now = new Date();
      if (now < scheduleRules.notBefore) {
          const diffMins = Math.ceil((scheduleRules.notBefore - now) / 60000);
          return res.status(403).json({ 
              error: 'Meeting has not started yet', 
              message: `Please check back in ${diffMins} minutes.`,
              valid: false
          });
      }
      if (now > scheduleRules.notAfter) {
          return res.status(403).json({ 
              error: 'Meeting has ended', 
              message: `This meeting session has already expired.`,
              valid: false
          });
      }
  }

  // Fetch active participants in the room
  const participants = meetings.getUsersInMeeting(meetingId) || [];
  const participantNames = participants.map(p => p.username);
  
  res.json({
      valid: true,
      participantCount: participantNames.length,
      participants: participantNames
  });
});

// CRON JOB: Run every minute to check for meetings 15 minutes away
// "* * * * *" runs every minute
cron.schedule('* * * * *', () => {
  const upcoming = scheduledMeetings.getUpcomingMeetings();
  const now = new Date();

  upcoming.forEach(mtg => {
    // Calculate difference in minutes
    const diffMs = mtg.time - now;
    const diffMins = Math.floor(diffMs / 1000 / 60);

    // If exactly 15 minutes away (or 14-15 window)
    if (diffMins === 15) {
      console.log(`[Cron] Target match! Meeting ${mtg.meetingId} is 15 minutes away. Sending reminders.`);
      sendReminderEmail(mtg.emails, mtg.meetingId, mtg.time);
      scheduledMeetings.markReminderSent(mtg.meetingId);
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`NexusMeet Server running on port ${PORT}`);
});

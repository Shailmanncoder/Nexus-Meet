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
    const { date, time, emails } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Date and time required' });

    // Combine into parseable date string
    const datetimeStr = `${date}T${time}`;
    const meetingId = scheduledMeetings.scheduleMeeting(datetimeStr, emails || '');

    res.json({ success: true, meetingId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

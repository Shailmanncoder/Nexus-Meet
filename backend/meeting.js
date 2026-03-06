const { v4: uuidv4 } = require('uuid');

// In-memory meeting store
const activeMeetings = new Map();

function createMeeting(hostSocketId, providedId) {
  const meetingId = providedId || generateMeetingId();
  
  // If meeting already exists with this ID, just return it
  if (activeMeetings.has(meetingId)) {
    return meetingId;
  }

  activeMeetings.set(meetingId, {
    id: meetingId,
    host: hostSocketId,
    participants: [],
    recording: false,
    createdAt: Date.now()
  });
  return meetingId;
}

function joinMeeting(meetingId, socketId, username, consent) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) {
    // Auto-create for flexibility
    createMeeting(socketId, meetingId);
  }

  const mtg = activeMeetings.get(meetingId);
  mtg.participants.push({ socketId, username, consent, joinedAt: Date.now() });
  return { success: true };
}

function leaveMeeting(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return 'not-found';

  meeting.participants = meeting.participants.filter(p => p.socketId !== socketId);

  if (meeting.participants.length === 0) {
    activeMeetings.delete(meetingId);
    return 'destroyed';
  }
  return 'left';
}

function getUsersInMeeting(meetingId) {
  const meeting = activeMeetings.get(meetingId);
  return meeting ? meeting.participants : [];
}

function getHost(meetingId) {
  const meeting = activeMeetings.get(meetingId);
  return meeting ? meeting.host : null;
}

function isRecording(meetingId) {
  const meeting = activeMeetings.get(meetingId);
  return meeting ? meeting.recording : false;
}

function setRecording(meetingId, state) {
  const meeting = activeMeetings.get(meetingId);
  if (meeting) meeting.recording = state;
}

function generateMeetingId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  id += '-';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

module.exports = {
  createMeeting,
  joinMeeting,
  leaveMeeting,
  getUsersInMeeting,
  getHost,
  isRecording,
  setRecording
};

const { v4: uuidv4 } = require('uuid');

const scheduledMeetings = require('./scheduled_meetings');

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
    coHosts: [], // Add co-hosts array
    participants: [],
    waitingRoom: [],
    recording: false,
    createdAt: Date.now()
  });
  return meetingId;
}

function joinMeeting(meetingId, socketId, username, consent) {
  // Check schedule constraints first
  const scheduleRules = scheduledMeetings.getMeetingRules(meetingId);
  if (scheduleRules) {
      const now = new Date();
      if (now < scheduleRules.notBefore) {
          const diffMins = Math.ceil((scheduleRules.scheduledTime - now) / 60000);
          return { success: false, message: `Meeting has not started yet. Please check back in ${diffMins} minutes.` };
      }
      if (now > scheduleRules.notAfter) {
          return { success: false, message: `Meeting has already ended or expired.` };
      }
  }

  const meeting = activeMeetings.get(meetingId);
  if (!meeting) {
    // Auto-create for flexibility
    createMeeting(socketId, meetingId);
  }

  const mtg = activeMeetings.get(meetingId);
  
  // Set meeting security if derived from schedule
  if (scheduleRules && scheduleRules.security) {
      mtg.security = scheduleRules.security;
  } else if (!mtg.security) {
      mtg.security = 'open'; // default
  }

  // Check if they were already admitted (bypass waiting room)
  const isAlreadyAdmitted = mtg.participants.some(p => p.socketId === socketId);
  const isUserHost = mtg.host === socketId;
  const isUserCoHost = mtg.coHosts && mtg.coHosts.includes(socketId);
  
  if (!isAlreadyAdmitted && !isUserHost && !isUserCoHost && mtg.security === 'waiting_room') {
      mtg.waitingRoom.push({ socketId, username, requestedAt: Date.now() });
      return { success: false, requireApproval: true, message: 'Please wait for the host to let you in.' };
  }

  if (!isAlreadyAdmitted) {
      mtg.participants.push({ socketId, username, consent, joinedAt: Date.now() });
  }
  return { success: true };
}

function leaveMeeting(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return 'not-found';

  meeting.participants = meeting.participants.filter(p => p.socketId !== socketId);
  meeting.waitingRoom = meeting.waitingRoom.filter(w => w.socketId !== socketId);

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

// Waiting Room
function addToWaitingRoom(meetingId, socketId, username) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return false;
  meeting.waitingRoom.push({ socketId, username, requestedAt: Date.now() });
  return true;
}

function admitFromWaitingRoom(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return null;
  const idx = meeting.waitingRoom.findIndex(w => w.socketId === socketId);
  if (idx === -1) return null;
  const user = meeting.waitingRoom.splice(idx, 1)[0];
  
  // Add directly to participants to bypass the security check
  meeting.participants.push({ socketId: user.socketId, username: user.username, consent: true, joinedAt: Date.now() });
  return user;
}

function rejectFromWaitingRoom(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return null;
  const idx = meeting.waitingRoom.findIndex(w => w.socketId === socketId);
  if (idx === -1) return null;
  return meeting.waitingRoom.splice(idx, 1)[0];
}

function removeFromWaitingRoom(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return;
  meeting.waitingRoom = meeting.waitingRoom.filter(w => w.socketId !== socketId);
}

function isHost(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  return meeting && meeting.host === socketId;
}

function addCoHost(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return false;
  if (!meeting.coHosts.includes(socketId)) {
    meeting.coHosts.push(socketId);
  }
  return true;
}

function removeCoHost(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) return false;
  meeting.coHosts = meeting.coHosts.filter(id => id !== socketId);
  return true;
}

function isCoHost(meetingId, socketId) {
  const meeting = activeMeetings.get(meetingId);
  return meeting && meeting.coHosts.includes(socketId);
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
  setRecording,
  addToWaitingRoom,
  admitFromWaitingRoom,
  rejectFromWaitingRoom,
  removeFromWaitingRoom,
  isRecording,
  setRecording,
  addToWaitingRoom,
  admitFromWaitingRoom,
  removeFromWaitingRoom,
  isHost,
  addCoHost,
  removeCoHost,
  isCoHost
};

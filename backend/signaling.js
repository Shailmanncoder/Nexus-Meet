const meetings = require('./meeting');

function initSignaling(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Create a new meeting room
    socket.on('create-meeting', (data, callback) => {
      const meetingId = meetings.createMeeting(socket.id, data.meetingId);
      console.log(`[Socket] Meeting created: ${meetingId} by ${socket.id}`);
      callback({ success: true, meetingId });
    });

    // Join existing meeting (host joins directly, non-host goes to waiting room)
    socket.on('join-room', (data) => {
      const { meetingId, username, consent, isHost } = data;
      
      // If they are the host, or if no meeting exists yet (they ARE the creator)
      const hostId = meetings.getHost(meetingId);
      
      if (isHost || !hostId || hostId === socket.id) {
        // Host joins directly
        directJoin(socket, meetingId, username, consent, io);
      } else {
        // Non-host: add to waiting room, notify host
        meetings.addToWaitingRoom(meetingId, socket.id, username);
        socket.meetingId = meetingId;
        socket.username = username;
        
        // Tell the requesting user to wait
        socket.emit('waiting-for-host');
        
        // Notify the host
        io.to(hostId).emit('user-requesting-join', {
          socketId: socket.id,
          username: username
        });
        
        console.log(`[Socket] ${username} (${socket.id}) waiting to join: ${meetingId}`);
      }
    });

    // Host admits a user from waiting room
    socket.on('admit-user', (data) => {
      const { meetingId, socketId } = data;
      const admitted = meetings.admitFromWaitingRoom(meetingId, socketId);
      if (admitted) {
        // Tell the admitted user they can join
        io.to(socketId).emit('admitted-to-meeting');
        console.log(`[Socket] Host admitted ${admitted.username} to ${meetingId}`);
      }
    });

    // Host denies a user
    socket.on('deny-user', (data) => {
      const { meetingId, socketId } = data;
      meetings.removeFromWaitingRoom(meetingId, socketId);
      io.to(socketId).emit('denied-from-meeting');
      console.log(`[Socket] Host denied user ${socketId} from ${meetingId}`);
    });

    // Actual join after being admitted (or direct join for host)
    socket.on('complete-join', (data) => {
      const { meetingId, username, consent } = data;
      directJoin(socket, meetingId, username, consent, io);
    });

    // WebRTC Signaling: relay offers/answers/ICE candidates
    socket.on('sending-signal', (payload) => {
      io.to(payload.userToSignal).emit('user-joined-signal', {
        signal: payload.signal,
        callerId: payload.callerId,
        callerName: payload.callerName
      });
    });

    socket.on('returning-signal', (payload) => {
      io.to(payload.callerId).emit('receiving-returned-signal', {
        signal: payload.signal,
        id: socket.id
      });
    });

    // Chat
    socket.on('send-message', (data) => {
      if (socket.meetingId) {
        io.to(socket.meetingId).emit('receive-message', {
          sender: socket.username || 'Anonymous',
          message: data.message,
          socketId: socket.id,
          timestamp: Date.now()
        });
      }
    });

    // Media toggle broadcasts
    socket.on('toggle-media', (data) => {
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('user-toggled-media', {
          socketId: socket.id,
          type: data.type,
          state: data.state
        });
      }
    });

    // Recording state
    socket.on('start-recording', (data) => {
      if (socket.meetingId) {
        meetings.setRecording(socket.meetingId, true);
        socket.to(socket.meetingId).emit('recording-started', {
          by: socket.username
        });
      }
    });

    socket.on('stop-recording', (data) => {
      if (socket.meetingId) {
        meetings.setRecording(socket.meetingId, false);
        socket.to(socket.meetingId).emit('recording-stopped');
      }
    });

    // Screen share toggle
    socket.on('screen-share-toggle', (data) => {
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('user-screen-share-toggled', {
          socketId: socket.id,
          isSharing: data.isSharing
        });
      }
    });

    // Whiteboard events (frontend emits wb-draw / wb-clear)
    socket.on('wb-draw', (data) => {
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('wb-draw-received', data);
      }
    });

    socket.on('wb-clear', (data) => {
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('wb-clear-received');
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.meetingId) {
        const result = meetings.leaveMeeting(socket.meetingId, socket.id);
        if (result === 'left') {
          socket.to(socket.meetingId).emit('user-left', { socketId: socket.id });
        } else if (result === 'destroyed') {
          socket.to(socket.meetingId).emit('meeting-ended');
        }
      }
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}

// Helper: direct join into meeting room
function directJoin(socket, meetingId, username, consent, io) {
  const result = meetings.joinMeeting(meetingId, socket.id, username, consent);

  if (!result.success) {
    socket.emit('error-joining', { message: result.message });
    return;
  }

  socket.join(meetingId);
  socket.meetingId = meetingId;
  socket.username = username;

  console.log(`[Socket] ${username} (${socket.id}) joined meeting: ${meetingId}`);

  // Tell the new user about existing users
  const usersInRoom = meetings.getUsersInMeeting(meetingId).filter(u => u.socketId !== socket.id);
  socket.emit('users-in-room', {
    users: usersInRoom,
    host: meetings.getHost(meetingId),
    recording: meetings.isRecording(meetingId)
  });

  // Tell existing users about the new user
  socket.to(meetingId).emit('user-joined', {
    socketId: socket.id,
    username
  });
}

module.exports = initSignaling;

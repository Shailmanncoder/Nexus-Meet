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

    // Join meeting — everyone joins directly, no waiting room
    socket.on('join-room', (data) => {
      const { meetingId, username, consent } = data;
      
      // Auto-create meeting if it doesn't exist
      if (!meetings.getHost(meetingId)) {
        meetings.createMeeting(socket.id, meetingId);
      }
      
      const result = meetings.joinMeeting(meetingId, socket.id, username, consent);
      if (!result.success) {
        if (result.requireApproval) {
          socket.emit('waiting-for-approval', { message: result.message });
          
          // Notify Host and Co-Hosts
          const hostId = meetings.getHost(meetingId);
          if (hostId) io.to(hostId).emit('user-waiting', { socketId: socket.id, username });
          
          const activeMeeting = meetings.activeMeetings ? meetings.activeMeetings.get(meetingId) : null;
          if (activeMeeting && activeMeeting.coHosts) {
              activeMeeting.coHosts.forEach(coHostId => {
                  io.to(coHostId).emit('user-waiting', { socketId: socket.id, username });
              });
          }
          return;
        }
        socket.emit('error-joining', { message: result.message });
        return;
      }

      socket.join(meetingId);
      socket.meetingId = meetingId;
      socket.username = username;

      console.log(`[Socket] ${username} (${socket.id}) joined meeting: ${meetingId}`);

      // Tell the new user about existing users
      const usersInRoom = meetings.getUsersInMeeting(meetingId).filter(u => u.socketId !== socket.id);
      const meetingData = meetings.activeMeetings ? meetings.activeMeetings.get(meetingId) : {coHosts:[]};
      socket.emit('users-in-room', {
        users: usersInRoom,
        host: meetings.getHost(meetingId),
        coHosts: meetingData ? meetingData.coHosts : [],
        recording: meetings.isRecording(meetingId)
      });

      // Tell existing users about the new user
      socket.to(meetingId).emit('user-joined', {
        socketId: socket.id,
        username
      });
    });

    // === Waiting Room Host Actions ===
    socket.on('admit-user', (data) => {
      const { targetSocketId } = data;
      if (socket.meetingId && (meetings.isHost(socket.meetingId, socket.id) || meetings.isCoHost(socket.meetingId, socket.id))) {
          const user = meetings.admitFromWaitingRoom(socket.meetingId, targetSocketId);
          if (user) {
              // Tell the waiting user they are approved
              io.to(targetSocketId).emit('approved-to-join', { meetingId: socket.meetingId, username: user.username });
          }
      }
    });

    socket.on('deny-user', (data) => {
      const { targetSocketId } = data;
      if (socket.meetingId && (meetings.isHost(socket.meetingId, socket.id) || meetings.isCoHost(socket.meetingId, socket.id))) {
          meetings.rejectFromWaitingRoom(socket.meetingId, targetSocketId);
          io.to(targetSocketId).emit('error-joining', { message: 'The host denied your entry.' });
      }
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

    // Whiteboard events
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

    socket.on('whiteboard-toggle', (data) => {
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('whiteboard-toggled', data);
      }
    });

    // === Co-Host Management ===
    socket.on('make-cohost', (data) => {
      // Allow only the original Host to make someone a co-host
      if (socket.meetingId && meetings.isHost(socket.meetingId, socket.id)) {
         meetings.addCoHost(socket.meetingId, data.targetSocketId);
         io.to(socket.meetingId).emit('cohost-assigned', { socketId: data.targetSocketId });
      }
    });

    socket.on('remove-cohost', (data) => {
      if (socket.meetingId && meetings.isHost(socket.meetingId, socket.id)) {
         meetings.removeCoHost(socket.meetingId, data.targetSocketId);
         io.to(socket.meetingId).emit('cohost-removed', { socketId: data.targetSocketId });
      }
    });
    
    // Remote actions (Host/Co-Host)
    socket.on('remote-mute', (data) => {
      if (socket.meetingId && (meetings.isHost(socket.meetingId, socket.id) || meetings.isCoHost(socket.meetingId, socket.id))) {
         io.to(data.targetSocketId).emit('force-mute');
      }
    });
    
    socket.on('remote-remove', (data) => {
      if (socket.meetingId && (meetings.isHost(socket.meetingId, socket.id) || meetings.isCoHost(socket.meetingId, socket.id))) {
         // Prevent removing the original host
         if(!meetings.isHost(socket.meetingId, data.targetSocketId)) {
            io.to(data.targetSocketId).emit('force-remove');
         }
      }
    });

    // Reactions and Hand raising
    socket.on('send-reaction', (data) => {
        if(socket.meetingId) {
            socket.to(socket.meetingId).emit('reaction-received', { socketId: socket.id, emoji: data.emoji });
        }
    });

    socket.on('raise-hand-toggle', (data) => {
        if(socket.meetingId) {
            socket.to(socket.meetingId).emit('hand-raised-received', { socketId: socket.id, state: data.state });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.meetingId) {
        meetings.removeCoHost(socket.meetingId, socket.id);
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

module.exports = initSignaling;

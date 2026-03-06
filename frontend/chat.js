/**
 * chat.js - Chat messaging logic
 */

document.addEventListener('DOMContentLoaded', () => {
   const btnSend = document.getElementById('btn-send-message');
   const inputChat = document.getElementById('chat-input');
   const messagesContainer = document.getElementById('chat-messages');
   const badgeUnread = document.getElementById('badge-chat-unread');

   function sendMessage() {
       const msg = inputChat.value.trim();
       if (!msg) return;

       const socket = window.getSocket();
       if (socket && AppState.meetingId) {
           socket.emit('send-message', { meetingId: AppState.meetingId, message: msg });
           inputChat.value = '';
       }
   }

   btnSend.addEventListener('click', sendMessage);
   inputChat.addEventListener('keydown', (e) => {
       if (e.key === 'Enter') sendMessage();
   });

   // Listen for socket availability to bind receive events
   // Since socket is initialized in webrtc.js, we hook into 'join-room' or poll occasionally
   // Better way: expose a setter or event when connected.
   const waitSocket = setInterval(() => {
       const socket = window.getSocket();
       if(socket) {
           clearInterval(waitSocket);
           bindSocketEvents(socket);
       }
   }, 500);

   function bindSocketEvents(socket) {
       socket.on('receive-message', (data) => {
           appendMessage(data);

           // Show unread badge if chat panel is not open
           if (AppState.activeSidebar !== 'chat') {
               badgeUnread.classList.remove('hidden');
               showToast(`New message from ${data.sender}`, "blue");
           }
       });
   }

   function appendMessage(data) {
       const isMe = data.socketId === window.getSocket().id;
       const timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

       const msgDiv = document.createElement('div');
       msgDiv.className = 'flex flex-col mb-4';

       msgDiv.innerHTML = `
           <div class="flex items-baseline justify-between mb-1">
               <span class="text-sm font-semibold ${isMe ? 'text-brand' : 'text-gray-300'}">${isMe ? 'You' : data.sender}</span>
               <span class="text-xs text-gray-500">${timeStr}</span>
           </div>
           <div class="text-sm text-gray-200 break-words">${data.message}</div>
       `;

       messagesContainer.appendChild(msgDiv);
       messagesContainer.scrollTop = messagesContainer.scrollHeight;
   }
});

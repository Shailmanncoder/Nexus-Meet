/**
 * app.js - Main UI controller, routing logic, and DOM interactions
 */

const AppState = {
  view: 'home', // home, prejoin, meeting
  meetingId: null,
  username: '',
  consentGiven: false,
  isHost: false,
  recordingMode: 'none', // none, entire, selective
  
  // Media state
  micEnabled: true,
  camEnabled: true,
  
  // Sidebar state
  activeSidebar: null, // chat, participants, details
  
  // Toast container tracking
  toastContainer: null
};

document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  const path = window.location.pathname;
  if (path.includes('prejoin.html')) {
      AppState.view = 'prejoin';
      initPrejoin();
  } else if (path.includes('meeting.html')) {
      AppState.view = 'meeting';
      initMeeting();
  } else {
      AppState.view = 'home';
      bindHomeEvents();
      // URL checking for direct invites returning to index
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get('code');
      if (codeParam) {
         window.location.href = `prejoin.html?code=${codeParam}`;
      }
  }
});

function initDOM() {
  // Setup clock loop for footer
  setInterval(() => {
    const displays = document.querySelectorAll('.meeting-time-display');
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    displays.forEach(el => el.textContent = timeStr);
  }, 1000);

  // Setup toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
  AppState.toastContainer = toastContainer;
  
  // Bind more options dropdown if present
  const btnMore = document.getElementById('btn-more-options');
  if (btnMore) {
      const dropdown = btnMore.nextElementSibling;
      btnMore.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', () => {
          dropdown.classList.add('hidden');
      });
  }
  
  const btnMoreMobile = document.getElementById('btn-more-options-mobile');
  if (btnMoreMobile) {
      const dropdownMobile = btnMoreMobile.nextElementSibling;
      btnMoreMobile.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdownMobile.classList.toggle('hidden');
      });
      document.addEventListener('click', () => {
          dropdownMobile.classList.add('hidden');
      });
  }
}

function showToast(message, type = 'blue') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;
  AppState.toastContainer.appendChild(toast);
  setTimeout(() => {
    if(toast.parentElement) toast.remove();
  }, 5000);
}

// -----------------------------------------------------
// HOME SCREEN LOGIC
// -----------------------------------------------------
function bindHomeEvents() {
  const btnCreateMobile = document.getElementById('btn-create-meeting-mobile');
  const btnCreateLegacy = document.getElementById('btn-create-meeting');
  const btnJoinFromHome = document.getElementById('btn-join-from-home');
  const inputCode = document.getElementById('input-join-code');
  const sheet = document.getElementById('new-meeting-sheet');
  const sheetContent = sheet ? sheet.querySelector('.sheet-content') : null;

  // Initialize Home Avatar
  const homeAvatar = document.getElementById('home-user-avatar');
  if(homeAvatar) {
      const savedName = localStorage.getItem('nexusmeet_username');
      if(savedName) {
          homeAvatar.textContent = savedName.charAt(0).toUpperCase();
      }
  }

  // Toggling the New Meeting Sheet
  const openSheet = () => {
      if(sheet) {
          sheet.classList.remove('hidden');
          if(sheetContent) {
              setTimeout(() => sheetContent.classList.remove('translate-y-full'), 10);
          }
      }
  };
  
  const closeSheet = () => {
      if(sheet && sheetContent) {
          sheetContent.classList.add('translate-y-full');
          setTimeout(() => sheet.classList.add('hidden'), 150); // Match transition duration
      }
  };

  if(btnCreateMobile) btnCreateMobile.addEventListener('click', openSheet);
  if(btnCreateLegacy) btnCreateLegacy.addEventListener('click', openSheet);
  
  // Close sheet when clicking overlay
  if(sheet) {
      sheet.addEventListener('click', (e) => {
          if (e.target === sheet) closeSheet();
      });
  }

  // Sheet Option 1: Get Link to Share
  const btnGetLink = document.getElementById('btn-get-link');
  if(btnGetLink) {
      btnGetLink.addEventListener('click', () => {
          const newCode = Array.from(Array(8), () => Math.floor(Math.random() * 36).toString(36)).join('');
          const meetingId = newCode.slice(0, 3) + '-' + newCode.slice(3, 7) + '-' + newCode.slice(7);
          const joinUrl = `${window.location.origin}${window.location.pathname.replace('index.html', 'legal.html')}?code=${meetingId}`;
          navigator.clipboard.writeText(joinUrl).then(() => {
             showToast('Meeting link copied to clipboard', 'blue');
             closeSheet();
          });
      });
  }

  // Sheet Option 2: Start an instant meeting
  const btnInstant = document.getElementById('btn-instant-meeting');
  if(btnInstant) {
      btnInstant.addEventListener('click', () => {
          const newCode = Array.from(Array(8), () => Math.floor(Math.random() * 36).toString(36)).join('');
          const meetingId = newCode.slice(0, 3) + '-' + newCode.slice(3, 7) + '-' + newCode.slice(7);
          window.location.href = `legal.html?code=${meetingId}&host=true`;
      });
  }

  // Sheet Option 3: Schedule
  const btnScheduleSheet = document.getElementById('btn-schedule-meeting-sheet');
  if(btnScheduleSheet) {
      btnScheduleSheet.addEventListener('click', () => {
          window.location.href = 'schedule.html';
      });
  }

  // User input validation
  if(inputCode) {
      inputCode.addEventListener('input', () => {
        if(btnJoinFromHome) btnJoinFromHome.disabled = inputCode.value.trim().length < 3;
      });

      inputCode.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && inputCode.value.trim().length >= 3) {
              e.preventDefault();
              const code = inputCode.value.trim();
              let parsedCode = code;
              if (code.includes('?code=')) {
                  parsedCode = new URL(code).searchParams.get('code');
              }
              window.location.href = `legal.html?code=${parsedCode}&host=false`;
          }
      });
  }

  if(btnJoinFromHome) {
      btnJoinFromHome.addEventListener('click', () => {
        const code = inputCode.value.trim();
        if(code) {
          let parsedCode = code;
          if (code.includes('?code=')) {
              parsedCode = new URL(code).searchParams.get('code');
          }
          window.location.href = `legal.html?code=${parsedCode}&host=false`;
        }
      });
  }

  // Scheduling Logic - Navigate to dedicated page
  const btnSchedule = document.getElementById('btn-schedule-meeting');
  if(btnSchedule) {
      btnSchedule.addEventListener('click', () => {
          window.location.href = 'schedule.html';
      });
  }

  // Handle returning from schedule page with a pre-filled code
  const urlParamsSchedule = new URLSearchParams(window.location.search);
  const scheduledCode = urlParamsSchedule.get('scheduledCode');
  if(scheduledCode && inputCode) {
      inputCode.value = scheduledCode;
      if(btnJoinFromHome) btnJoinFromHome.disabled = false;
  }
}

// -----------------------------------------------------
// PRE-JOIN LOBBY
// -----------------------------------------------------
function initPrejoin() {
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  const isHost = urlParams.get('host') === 'true';
  const recMode = urlParams.get('rec') || 'none';
  const consentGiven = urlParams.get('consent') === 'true';
  
  AppState.meetingId = codeParam;
  AppState.isHost = isHost;
  AppState.recordingMode = recMode;
  AppState.consentGiven = consentGiven;

  // Start local media preview (handled by webrtc.js listener)
  window.dispatchEvent(new CustomEvent('init-local-media'));
  
  const idDisplay = document.getElementById('prejoin-meeting-id');
  if (codeParam) {
    idDisplay.textContent = `Meeting ID: ${codeParam}`;
  } else {
    idDisplay.textContent = `Meeting ID: Generating...`;
  }

  // Bind Buttons
  const btnJoin = document.getElementById('btn-join-meeting');
  const inputName = document.getElementById('input-username');
  
  // Pre-fill username if available
  const savedName = localStorage.getItem('nexusmeet_username');
  if(savedName && inputName) {
      inputName.value = savedName;
      if(btnJoin) btnJoin.disabled = false;
  }
  
  inputName.addEventListener('input', () => {
    btnJoin.disabled = inputName.value.trim().length === 0;
  });

  btnJoin.onclick = () => {
    AppState.username = inputName.value.trim();
    if(AppState.username) {
       localStorage.setItem('nexusmeet_username', AppState.username);
       window.location.href = `meeting.html?code=${AppState.meetingId}&name=${encodeURIComponent(AppState.username)}&host=${AppState.isHost}&rec=${AppState.recordingMode}&consent=${AppState.consentGiven}`;
    }
  };

  document.getElementById('btn-cancel-join').onclick = () => {
    window.location.href = 'index.html'; 
  };

  // Prejoin MIC AND CAM TOGGLES
  const btnPrejoinMic = document.getElementById('btn-prejoin-mic');
  const btnPrejoinCam = document.getElementById('btn-prejoin-cam');
  
  if (btnPrejoinMic) {
      btnPrejoinMic.addEventListener('click', () => {
function initMeetingControls() {
    // Media controls
    document.getElementById('btn-toggle-mic').onclick = () => {
        AppState.micEnabled = !AppState.micEnabled;
        updateMediaButton('btn-toggle-mic', AppState.micEnabled, 'microphone');
        window.dispatchEvent(new CustomEvent('toggle-mic', { detail: { state: AppState.micEnabled }}));
    };

    document.getElementById('btn-toggle-cam').onclick = () => {
        AppState.camEnabled = !AppState.camEnabled;
        updateMediaButton('btn-toggle-cam', AppState.camEnabled, 'video');
        window.dispatchEvent(new CustomEvent('toggle-cam', { detail: { state: AppState.camEnabled }}));
    };

    // Screen sharing
    const btnScreen = document.getElementById('btn-toggle-screen');
    if(btnScreen) {
       btnScreen.onclick = () => {
          if(!isScreenSharing) {
             window.dispatchEvent(new CustomEvent('toggle-screen-share', { detail: { callback: (success) => {
                 if(success) {
                     isScreenSharing = true;
                     btnScreen.innerHTML = '<i class="fa-solid fa-rectangle-xmark text-[18px]"></i>';
                     btnScreen.classList.add('bg-brand');
                     btnScreen.classList.remove('bg-[#3c4043]');
                     document.getElementById('more-options-sheet').classList.add('hidden');
                 }
             }}}));
          } else {
             window.dispatchEvent(new CustomEvent('toggle-screen-share', { detail: { callback: () => {} }}));
          }
       };
    }

    // Reset screen share button if stopped externally
    window.addEventListener('screen-share-stopped', () => {
        isScreenSharing = false;
        if(btnScreen) {
           btnScreen.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket text-[18px]"></i>';
           btnScreen.classList.remove('bg-brand');
           btnScreen.classList.add('bg-[#3c4043]');
        }
    });

    // Leave call
    document.getElementById('btn-leave-call').onclick = () => {
        window.location.href = 'index.html'; // Quick ungraceful exit (socket disconnect handles cleanup)
    };

    // Sidebar navigation from bottom sheet
    const sidebarContainer = document.getElementById('sidebar-container');
    const panelChat = document.getElementById('panel-chat');
    const panelParticipants = document.getElementById('panel-participants');
    const title = document.getElementById('sidebar-title');
    const sheet = document.getElementById('more-options-sheet');
    const sheetContent = sheet ? sheet.querySelector('.sheet-content') : null;

    function openSidebar(panelId, titleText) {
        sidebarContainer.classList.remove('hidden');
        // Give browser beat to render display block before translating
        setTimeout(() => sidebarContainer.classList.remove('translate-x-full'), 10);
        
        if (panelChat) panelChat.classList.add('hidden-panel');
        if (panelParticipants) panelParticipants.classList.add('hidden-panel');
        
        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
            targetPanel.classList.remove('hidden-panel');
            targetPanel.classList.add('flex-1');
        }
        
        if (title) title.textContent = titleText;
        if(panelId === 'panel-chat') {
            document.getElementById('badge-chat-unread-indicator')?.classList.add('hidden');
        }
        
        // Hide bottom sheet if doing this from the sheet
        if(sheet) {
            if (sheetContent) sheetContent.classList.add('translate-y-full');
            setTimeout(() => sheet.classList.add('hidden'), 300);
        }
    }

    const btnPartsSheet = document.getElementById('btn-show-participants-sheet');
    if (btnPartsSheet) btnPartsSheet.onclick = () => openSidebar('panel-participants', 'People');
    
    const btnChatSheet = document.getElementById('btn-show-chat-sheet');
    if (btnChatSheet) btnChatSheet.onclick = () => openSidebar('panel-chat', 'In-call messages');
    
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    if (btnCloseSidebar) {
        btnCloseSidebar.onclick = () => {
            sidebarContainer.classList.add('translate-x-full');
            setTimeout(() => sidebarContainer.classList.add('hidden'), 300);
        };
    }

    // More Options Bottom Sheet Toggling
    const btnMore = document.getElementById('btn-more-options');
    if (btnMore && sheet && sheetContent) {
        btnMore.onclick = () => {
            sheet.classList.remove('hidden');
            setTimeout(() => sheetContent.classList.remove('translate-y-full'), 10);
        };
        
        // Click outside to close sheet
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) {
                sheetContent.classList.add('translate-y-full');
                setTimeout(() => sheet.classList.add('hidden'), 300);
            }
        });
    }

    // Top left meeting code click to copy details
    const meetCodeDisplay = document.getElementById('meeting-code-display');
    const meetCodeDisplayMobile = document.getElementById('meeting-code-display-mobile');
    const copyLinkAction = () => {
        const url = window.location.href.split('?')[0] + '?code=' + AppState.meetingId;
        window.navigator.clipboard.writeText(url).then(() => {
            showToast("Meeting link copied", "blue");
        });
    };
    if (meetCodeDisplay) meetCodeDisplay.onclick = copyLinkAction;
    if (meetCodeDisplayMobile) meetCodeDisplayMobile.onclick = copyLinkAction;

    // Remove legacy dropdown listeners since we use bottom sheet
}
          const videoEl = document.getElementById('prejoin-video');
          const camOffEl = document.getElementById('prejoin-camera-off');
          if(AppState.camEnabled) {
              if(videoEl) videoEl.classList.remove('hidden');
              if(camOffEl) camOffEl.classList.add('hidden');
          } else {
              if(videoEl) videoEl.classList.add('hidden');
              if(camOffEl) camOffEl.classList.remove('hidden');
          }
      });
  }
}

// -----------------------------------------------------
// MEETING VIEW
// -----------------------------------------------------
function initMeeting() {
  const urlParams = new URLSearchParams(window.location.search);
  AppState.meetingId = urlParams.get('code');
  AppState.username = urlParams.get('name');
  AppState.isHost = urlParams.get('host') === 'true';
  AppState.recordingMode = urlParams.get('rec') || 'none';
  AppState.consentGiven = urlParams.get('consent') === 'true';

  // Initialize local camera/mic FIRST, then join the room
  window.addEventListener('local-media-ready', () => {
    // Fire event for WebRTC logic to connect to socket server
    window.dispatchEvent(new CustomEvent('join-room', {
      detail: { 
        username: AppState.username,
        meetingId: AppState.meetingId,
        consent: AppState.consentGiven,
        isHost: AppState.isHost,
        recordingMode: AppState.recordingMode
      }
    }));
  }, { once: true });

  // Request camera & mic access
  window.dispatchEvent(new CustomEvent('init-local-media'));

  bindMeetingControls();
}

function bindMeetingControls() {
  const btnMic = document.getElementById('btn-toggle-mic');
  const btnCam = document.getElementById('btn-toggle-cam');
  const btnLeave = document.getElementById('btn-leave-call');

  if(btnMic) {
    btnMic.addEventListener('click', () => {
      AppState.micEnabled = !AppState.micEnabled;
      updateControlUI(btnMic, AppState.micEnabled, 'fa-microphone', 'fa-microphone-slash');
      window.dispatchEvent(new CustomEvent('toggle-mic', { detail: { state: AppState.micEnabled }}));
    });
  }

  if(btnCam) {
    btnCam.addEventListener('click', () => {
      AppState.camEnabled = !AppState.camEnabled;
      updateControlUI(btnCam, AppState.camEnabled, 'fa-video', 'fa-video-slash');
      window.dispatchEvent(new CustomEvent('toggle-cam', { detail: { state: AppState.camEnabled }}));
    });
  }

  if(btnLeave) {
    btnLeave.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  // Screen Share Toggle (HTML id is btn-toggle-screen)
  const btnShare = document.getElementById('btn-toggle-screen');
  let isSharing = false;
  if(btnShare) {
    btnShare.addEventListener('click', () => {
         window.dispatchEvent(new CustomEvent('toggle-screen-share', {
              detail: { 
                   callback: (success) => {
                        if(success) {
                            isSharing = !isSharing;
                            if(isSharing) {
                                btnShare.classList.add('active');
                            } else {
                                btnShare.classList.remove('active');
                            }
                        }
                   }
              }
         }));
    });

    window.addEventListener('screen-share-stopped', () => {
         isSharing = false;
         btnShare.classList.remove('active');
    });
  }

  // Sidebar Toggles - Desktop and Bottom Sheet Mobile unified
  const panelChat = document.getElementById('panel-chat');
  const panelParticipants = document.getElementById('panel-participants');
  
  const toggleSidebar = (panelId, titleText) => {
    const container = document.getElementById('sidebar-container');
    const title = document.getElementById('sidebar-title');
    
    // Switch to target view
    [panelChat, panelParticipants].forEach(p => {
        if(p) p.classList.add('hidden-panel');
    });
    
    const target = document.getElementById(panelId);
    if(target) {
        target.classList.remove('hidden-panel');
        target.classList.add('flex-1');
    }
    
    if(title) title.textContent = titleText;
    
    // Ensure visibility
    container.classList.remove('hidden');
    setTimeout(() => {
         container.classList.remove('translate-x-full');
    }, 10);
    
    if(panelId === 'panel-chat') {
         const badge = document.getElementById('badge-chat-unread');
         if(badge) badge.classList.add('hidden');
    }
    
    // Re-layout grid
    window.dispatchEvent(new CustomEvent('grid-resize'));
    
    // Close bottom sheet if open
    const sheet = document.getElementById('more-options-sheet');
    if(sheet) {
        const sheetContent = sheet.querySelector('.sheet-content');
        if (sheetContent) sheetContent.classList.add('translate-y-full');
        setTimeout(() => sheet.classList.add('hidden'), 300);
    }
  };

  // Bind Bottom Sheet List Items & Desktop small buttons
  const btnPartsDesktop = document.getElementById('btn-show-participants');
  const btnPartsSheet = document.getElementById('btn-show-participants-sheet');
  if(btnPartsDesktop) btnPartsDesktop.onclick = () => toggleSidebar('panel-participants', 'People');
  if(btnPartsSheet) btnPartsSheet.onclick = () => toggleSidebar('panel-participants', 'People');
  
  const btnChatDesktop = document.getElementById('btn-show-chat');
  const btnChatSheet = document.getElementById('btn-show-chat-sheet');
  if(btnChatDesktop) btnChatDesktop.onclick = () => toggleSidebar('panel-chat', 'In-call messages');
  if(btnChatSheet) btnChatSheet.onclick = () => toggleSidebar('panel-chat', 'In-call messages');

  const btnClose = document.getElementById('btn-close-sidebar');
  if(btnClose) {
    btnClose.addEventListener('click', () => {
      const container = document.getElementById('sidebar-container');
      container.classList.add('translate-x-full');
      setTimeout(() => {
          container.classList.add('hidden');
      }, 300);
    });
  }

  // Whiteboard Toggle
  const whiteboardTriggers = document.querySelectorAll('.btn-drawing-board-trigger');
  const whiteboardContainer = document.getElementById('whiteboard-container');
  const btnCloseWhiteboard = document.getElementById('btn-close-whiteboard');

  whiteboardTriggers.forEach(btn => {
      btn.addEventListener('click', (e) => {
           e.preventDefault();
           if(whiteboardContainer) {
             whiteboardContainer.classList.remove('hidden');
             whiteboardContainer.classList.add('flex');
           }
           
           // Hide dropdowns if they are open
           const openDropdowns = document.querySelectorAll('.dropdown-menu');
           openDropdowns.forEach(dd => dd.classList.add('hidden'));

           if(window.initWhiteboard) window.initWhiteboard();
           const socket = window.getSocket ? window.getSocket() : null;
           if(socket) socket.emit('whiteboard-toggle', { state: true });
      });
  });

  if(btnCloseWhiteboard) {
    btnCloseWhiteboard.addEventListener('click', () => {
         if(whiteboardContainer) {
           whiteboardContainer.classList.remove('flex');
           whiteboardContainer.classList.add('hidden');
         }
         const socket = window.getSocket ? window.getSocket() : null;
         if(socket) socket.emit('whiteboard-toggle', { state: false });
    });
  }

  // Links info (copy link in detail panel)
  const btnCopyLinkPanel = document.getElementById('btn-copy-link-panel');
  if(btnCopyLinkPanel) btnCopyLinkPanel.addEventListener('click', () => copyInfo());

  
  // More Options Bottom Sheet logic implementation
  const btnMoreOptions = document.getElementById('btn-more-options');
  const btnMoreOptionsMobile = document.getElementById('btn-more-options-mobile');
  const moreSheet = document.getElementById('more-options-sheet');
    
  const toggleMoreSheet = () => {
      if(moreSheet) {
          moreSheet.classList.remove('hidden');
          const sheetContent = moreSheet.querySelector('.sheet-content');
          if(sheetContent) {
              setTimeout(() => sheetContent.classList.remove('translate-y-full'), 10);
          }
      }
  };
  
  if(btnMoreOptions) btnMoreOptions.onclick = toggleMoreSheet;
  if(btnMoreOptionsMobile) btnMoreOptionsMobile.onclick = toggleMoreSheet;
  
  if(moreSheet) {
      moreSheet.addEventListener('click', (e) => {
          if (e.target === moreSheet) {
              const sheetContent = moreSheet.querySelector('.sheet-content');
              if (sheetContent) sheetContent.classList.add('translate-y-full');
              setTimeout(() => moreSheet.classList.add('hidden'), 300);
          }
      });
  }

  // Bind un-implemented features to dummy toasts to ensure buttons are 'real'
  const notImplToast = (feature) => {
      showToast(`${feature} will be implemented in a future update.`, "blue");
      // Close bottom sheet if open
      if(moreSheet) {
          const sheetContent = moreSheet.querySelector('.sheet-content');
          if (sheetContent) sheetContent.classList.add('translate-y-full');
          setTimeout(() => moreSheet.classList.add('hidden'), 300);
      }
  };

  const btnRaiseHand = document.getElementById('btn-raise-hand');
  const btnRaiseHandSheet = document.getElementById('btn-raise-hand-sheet');
  const btnCaptionsSheet = document.getElementById('btn-captions-sheet');
  const btnSpeakerSheet = document.getElementById('btn-speaker-sheet');

  if(btnRaiseHand) btnRaiseHand.onclick = () => notImplToast("Raise Hand");
  if(btnRaiseHandSheet) btnRaiseHandSheet.onclick = () => notImplToast("Raise Hand");
  if(btnCaptionsSheet) btnCaptionsSheet.onclick = () => notImplToast("Live Captions");
  if(btnSpeakerSheet) btnSpeakerSheet.onclick = () => notImplToast("Speaker Output");

  // Top header elements (meeting code, time, avatar)
  const headerCodeDisplay = document.getElementById('meeting-code-display');
  const headerCodeMobile = document.getElementById('meeting-code-display-mobile');
  const footerCodeDisplay = document.getElementById('footer-meeting-code');
  const headerAvatar = document.getElementById('header-user-avatar');
  
  if(headerAvatar && AppState.username) {
      headerAvatar.textContent = AppState.username.charAt(0).toUpperCase();
  }
  
  const setupCodeCopy = (el) => {
      if(!el) return;
      el.textContent = AppState.meetingId;
      el.addEventListener('click', () => {
        const joinUrl = `${window.location.origin}${window.location.pathname.replace('meeting.html', 'legal.html')}?code=${AppState.meetingId}`;
        navigator.clipboard.writeText(joinUrl).then(() => {
           showToast('Meeting link copied to clipboard', 'blue');
        });
      });
  };
  
  setupCodeCopy(headerCodeDisplay);
  setupCodeCopy(headerCodeMobile);
  setupCodeCopy(footerCodeDisplay);

  // Time handling
  setInterval(() => {
    const timerEls = document.querySelectorAll('.meeting-time-display');
    const headerTimer = document.getElementById('meeting-timer');
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    timerEls.forEach(el => el.textContent = timeStr);
    if(headerTimer) headerTimer.textContent = timeStr;
  }, 1000);

  // Fallback cleanup of old tooltips / dropdowns that might conflict
  document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.add('hidden'));
}

function copyInfo() {
   const url = document.getElementById('meeting-url-display').textContent;
   navigator.clipboard.writeText(url).then(() => {
     showToast("Meeting link copied to clipboard!", "green");
   });
}

function updateControlUI(btnEl, isEnabled, iconOn, iconOff) {
  if(!btnEl) return;
  const iconEl = btnEl.querySelector('i');
  if(isEnabled) {
    if(iconEl && iconOn && iconOff) {
        iconEl.classList.remove(iconOff);
        iconEl.classList.add(iconOn);
    }
    btnEl.classList.remove('bg-danger', 'text-white', 'hover:bg-[#b3271d]', 'off');
    btnEl.classList.add('bg-[#3c4043]', 'hover:bg-[#4a4d51]', 'text-white');
  } else {
    if(iconEl && iconOn && iconOff) {
        iconEl.classList.remove(iconOn);
        iconEl.classList.add(iconOff);
    }
    btnEl.classList.remove('bg-[#3c4043]', 'hover:bg-[#4a4d51]');
    btnEl.classList.add('bg-danger', 'text-white', 'hover:bg-[#b3271d]', 'off');
  }
}

// Whiteboard Toggle
const whiteboardTriggers = document.querySelectorAll('.btn-drawing-board-trigger');
const whiteboardContainer = document.getElementById('whiteboard-container');
const btnCloseWhiteboard = document.getElementById('btn-close-whiteboard');

whiteboardTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
         e.preventDefault();
         if(whiteboardContainer) {
           whiteboardContainer.classList.remove('hidden');
           whiteboardContainer.classList.add('flex');
         }
         
         // Hide dropdowns if they are open
         const openDropdowns = document.querySelectorAll('.dropdown-menu');
         openDropdowns.forEach(dd => dd.classList.add('hidden'));

         if(window.initWhiteboard) window.initWhiteboard();
         const socket = window.getSocket ? window.getSocket() : null;
         if(socket) socket.emit('whiteboard-toggle', { state: true });
    });
});

if(btnCloseWhiteboard) {
  btnCloseWhiteboard.addEventListener('click', () => {
       if(whiteboardContainer) {
         whiteboardContainer.classList.remove('flex');
         whiteboardContainer.classList.add('hidden');
       }
       const socket = window.getSocket ? window.getSocket() : null;
       if(socket) socket.emit('whiteboard-toggle', { state: false });
  });
}

// Links info (copy link in detail panel)
const btnCopyLinkPanel = document.getElementById('btn-copy-link-panel');
if(btnCopyLinkPanel) btnCopyLinkPanel.addEventListener('click', () => copyInfo());

// Helpers
window.setMeetingUrls = (id) => {
   const d1 = document.getElementById('meeting-code-display');
   const d2 = document.getElementById('footer-meeting-code');
   const d3 = document.getElementById('meeting-url-display');
   
   if(d1) d1.textContent = id;
   if(d2) d2.textContent = id;
   
   const url = `${window.location.origin}?code=${id}`;
   if(d3) d3.textContent = url;

   // Auto configure host controls if host
   if(AppState.isHost) {
      document.getElementById('host-controls-section').classList.remove('hidden');
   }
}

window.AppState = AppState;

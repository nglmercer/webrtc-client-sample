export class UIController {
  constructor(rtcManager, videoManager) {
    this.rtc = rtcManager;
    this.videoManager = videoManager;
    this.elements = {};
  }

  init() {
    this.bindElements();
    this.setupEventListeners();
    this.updateConnectionStatus('Disconnected', false);
  }

  bindElements() {
    this.elements = {
      roomId: document.getElementById('room-id'),
      openRoom: document.getElementById('open-room'),
      joinRoom: document.getElementById('join-room'),
      leaveRoom: document.getElementById('leave-room'),
      connectionStatus: document.getElementById('connection-status'),
      roomInfo: document.getElementById('room-info'),
      statusText: document.getElementById('status-text')
    };
  }

  setupEventListeners() {
    this.elements.openRoom.addEventListener('click', () => {
      this.handleOpenRoom();
    });

    this.elements.joinRoom.addEventListener('click', () => {
      this.handleJoinRoom();
    });

    this.elements.leaveRoom.addEventListener('click', () => {
      this.handleLeaveRoom();
    });

    this.elements.roomId.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleOpenRoom();
      }
    });

    // Listen to RTC events for UI updates
    this.rtc.on('roomOpened', (roomId) => {
      this.updateConnectionStatus('Connected (Broadcasting)', true);
      this.elements.roomInfo.textContent = `Room: ${roomId} (Host)`;
    });

    this.rtc.on('roomJoined', (roomId) => {
      this.updateConnectionStatus('Connected (Viewing)', true);
      this.elements.roomInfo.textContent = `Room: ${roomId} (Viewer)`;
    });

    this.rtc.on('error', (error) => {
      this.setButtonsDisabled(false);
      this.updateStatus(`Error: ${error.message || error}`);
    });
  }

  async handleOpenRoom() {
    const roomId = this.elements.roomId.value.trim();
    if (!roomId) {
      alert('Please enter a valid room ID');
      return;
    }

    this.setButtonsDisabled(true);
    this.updateStatus('Creating room...');

    try {
      const success = await this.rtc.openRoom(roomId);
      if (!success) {
        this.setButtonsDisabled(false);
        this.updateStatus('Failed to create room');
      }
    } catch (error) {
      this.setButtonsDisabled(false);
      this.updateStatus(`Error: ${error.message}`);
    }
  }

  async handleJoinRoom() {
    const roomId = this.elements.roomId.value.trim();
    if (!roomId) {
      alert('Please enter a valid room ID');
      return;
    }

    this.setButtonsDisabled(true);
    this.updateStatus('Joining room...');

    try {
      const success = await this.rtc.joinRoom(roomId);
      if (!success) {
        this.setButtonsDisabled(false);
        this.updateStatus('Failed to join room');
      }
    } catch (error) {
      this.setButtonsDisabled(false);
      this.updateStatus(`Error: ${error.message}`);
    }
  }

  handleLeaveRoom() {
    this.rtc.leaveRoom();
    this.videoManager.clearAllVideos();
    this.updateConnectionStatus('Disconnected', false);
    this.elements.roomInfo.textContent = '';
    this.setButtonsDisabled(false);
    this.updateStatus('Disconnected from room');
  }

  setButtonsDisabled(disabled) {
    this.elements.openRoom.disabled = disabled;
    this.elements.joinRoom.disabled = disabled;
    this.elements.roomId.disabled = disabled;
    this.elements.leaveRoom.disabled = !disabled;
  }

  updateConnectionStatus(status, connected) {
    this.elements.connectionStatus.textContent = status;
    this.elements.connectionStatus.className = connected ? 'connected' : 'disconnected';
  }

  updateStatus(message) {
    this.elements.statusText.textContent = message;
    console.log('UI Status:', message);
  }
}
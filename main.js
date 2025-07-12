import { RTCConnectionManager } from './src/rtc-connection-manager.js';
import { UIController } from './src/ui-controller.js';
import { VideoManager } from './src/video-manager.js';

class App {
  constructor() {
    this.rtcManager = new RTCConnectionManager();
    this.videoManager = new VideoManager();
    this.ui = new UIController(this.rtcManager, this.videoManager);
    
    this.init();
  }

  init() {
    console.log('Initializing RTCMultiConnection app...');
    this.ui.init();
    this.setupEventListeners();
    this.updateStatus('Application ready');
  }

  setupEventListeners() {
    // Listen to RTC events
    this.rtcManager.on('localStream', (stream, userid) => {
      this.videoManager.addLocalVideo(stream, userid);
      this.updateStatus('Local video started');
    });

    this.rtcManager.on('remoteStream', (stream, userid) => {
      this.videoManager.addRemoteVideo(stream, userid);
      this.updateStatus(`Remote participant joined: ${userid}`);
    });

    this.rtcManager.on('streamEnded', (userid) => {
      this.videoManager.removeVideo(userid);
      this.updateStatus(`Participant left: ${userid}`);
    });

    this.rtcManager.on('roomOpened', (roomid) => {
      this.updateStatus(`Room created: ${roomid}`);
    });

    this.rtcManager.on('roomJoined', (roomid) => {
      this.updateStatus(`Joined room: ${roomid}`);
    });

    this.rtcManager.on('error', (error) => {
      console.error('RTC Error:', error);
      this.updateStatus(`Error: ${error.message || error}`);
    });
  }

  updateStatus(message) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) {
      statusElement.textContent = message;
    }
    console.log('Status:', message);
  }
}

// Wait for RTCMultiConnection to be available
function waitForRTCMultiConnection() {
  if (typeof RTCMultiConnection !== 'undefined') {
    new App();
  } else {
    setTimeout(waitForRTCMultiConnection, 100);
  }
}

document.addEventListener('DOMContentLoaded', waitForRTCMultiConnection);
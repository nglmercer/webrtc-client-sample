export class RTCConnectionManager {
  constructor() {
    this.connection = null;
    this.eventListeners = new Map();
    this.isConnected = false;
    this.currentRoomId = null;
    
    this.initConnection();
  }

  initConnection() {
    // Wait for RTCMultiConnection to be available
    if (typeof RTCMultiConnection === 'undefined') {
      setTimeout(() => this.initConnection(), 100);
      return;
    }

    this.connection = new RTCMultiConnection();
    
    // Server configuration
    this.connection.socketURL = 'http://localhost:9001/';
    this.connection.socketMessageEvent = 'video-broadcast-demo';

    // Session configuration for one-way broadcasting
    this.connection.session = {
      audio: true,
      video: true,
      oneway: true
    };

    // ICE servers configuration
    this.connection.iceServers = [{
      'urls': [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    }];

    // Set up event handlers
    this.setupConnectionEvents();
  }

  setupConnectionEvents() {
    // Handle incoming streams
    this.connection.onstream = (event) => {
      console.log('Stream received:', event.type, event.userid);
      
      if (event.type === 'local') {
        this.emit('localStream', event.stream, event.userid);
      } else {
        this.emit('remoteStream', event.stream, event.userid);
      }
    };

    // Handle stream ended
    this.connection.onstreamended = (event) => {
      console.log('Stream ended:', event.userid);
      this.emit('streamEnded', event.userid);
    };

    // Handle room opened
    this.connection.onopen = (event) => {
      console.log('Room opened:', event.roomid);
      this.emit('roomOpened', event.roomid);
    };

    // Handle errors
    this.connection.onMediaError = (error) => {
      console.error('Media error:', error);
      this.emit('error', error);
    };

    // Handle connection errors
    this.connection.onerror = (error) => {
      console.error('Connection error:', error);
      this.emit('error', error);
    };
  }

  // Event system
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  emit(event, ...args) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        callback(...args);
      });
    }
  }

  // Create/open a room
  async openRoom(roomId) {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    try {
      this.currentRoomId = roomId;
      
      // Set SDP constraints for broadcaster (send only)
      this.connection.sdpConstraints.mandatory = {
        OfferToReceiveAudio: false,
        OfferToReceiveVideo: false
      };

      this.connection.open(roomId, (isRoomOpened, roomid, error) => {
        if (error) {
          this.emit('error', error);
          return;
        }
        
        if (isRoomOpened) {
          this.isConnected = true;
          this.emit('roomOpened', roomid);
        }
      });

      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  // Join an existing room
  async joinRoom(roomId) {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    try {
      this.currentRoomId = roomId;
      
      // Set SDP constraints for viewer (receive only)
      this.connection.sdpConstraints.mandatory = {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true
      };

      this.connection.join(roomId, (isJoined, roomid, error) => {
        if (error) {
          this.emit('error', error);
          return;
        }
        
        if (isJoined) {
          this.isConnected = true;
          this.emit('roomJoined', roomid);
        }
      });

      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  // Leave current room
  leaveRoom() {
    if (this.connection && this.isConnected) {
      this.connection.leave();
      this.connection.closeSocket();
      this.isConnected = false;
      this.currentRoomId = null;
      
      // Clear all videos
      this.emit('streamEnded', 'all');
      
      console.log('Left room');
    }
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      roomId: this.currentRoomId,
      isInitiator: this.connection ? this.connection.isInitiator : false
    };
  }
}
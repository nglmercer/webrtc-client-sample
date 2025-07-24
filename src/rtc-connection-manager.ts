// src/rtc-connection-manager.ts
import { io, Socket } from 'socket.io-client';

interface SignalData {
  type: 'offer' | 'answer' | 'candidate' | 'join' | 'leave';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  from: string;
  to?: string;
  roomId?: string;
}

interface StreamEvent {
  stream: MediaStream;
  userid: string;
  type: 'local' | 'remote';
}

interface RoomEvent {
  roomid: string;
  isJoined?: boolean;
  isRoomOpened?: boolean;
  error?: any;
}

export class RTCConnectionManager {
  private socket: Socket;
  private peerConnections: Map<string, RTCPeerConnection>;
  private localStream: MediaStream | null = null;
  private eventListeners: Map<string, Function[]>;
  private isConnected: boolean;
  private currentRoomId: string | null;
  private userId: string;
  private isBroadcaster: boolean = false;

  constructor() {
    this.peerConnections = new Map();
    this.eventListeners = new Map();
    this.isConnected = false;
    this.currentRoomId = null;
    this.userId = this.generateUserId();
    
    // Configurar conexión Socket.IO
    this.socket = io('http://localhost:9001/', {
      transports: ['websocket']
    });

    this.setupSocketEvents();
  }

  private generateUserId(): string {
    return 'user_' + Math.random().toString(36).substr(2, 9);
  }

  private setupSocketEvents(): void {
    this.socket.on('connect', () => {
      console.log('Connected to signaling server:', this.socket.id);
    });

    this.socket.on('signal', (data: SignalData) => {
      this.handleSignal(data);
    });

    this.socket.on('user-joined', ( data) => {
      if (this.isBroadcaster) {
        this.createPeerConnectionForUser(data.userId);
      }
    });

    this.socket.on('user-left', (userId: string) => {
      this.closePeerConnection(userId);
      this.emit('streamEnded', userId);
    });
  }

  private async createPeerConnectionForUser(userId: string): Promise<RTCPeerConnection> {
    const configuration: RTCConfiguration = {
      iceServers: [{
        urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
      }]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    this.peerConnections.set(userId, peerConnection);

    // Agregar tracks locales si somos broadcaster
    if (this.localStream && this.isBroadcaster) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream!);
      });
    }

    // Eventos ICE
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('signal', {
          type: 'candidate',
          candidate: event.candidate,
          from: this.socket.id,
          to: userId
        });
      }
    };

    // Evento para recibir streams
    peerConnection.ontrack = (event) => {
      const streamEvent: StreamEvent = {
        stream: event.streams[0],
        userid: userId,
        type: 'remote'
      };
      this.emit('remoteStream', streamEvent.stream, streamEvent.userid);
    };

    return peerConnection;
  }

  private async handleSignal( data:any): Promise<void> {
    const fromUserId = data.from;

    if (!this.peerConnections.has(fromUserId) && data.type !== 'candidate') {
      await this.createPeerConnectionForUser(fromUserId);
    }

    const peerConnection = this.peerConnections.get(fromUserId);
    if (!peerConnection) return;

    try {
      switch (data.type) {
        case 'offer':
          if (data.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.socket.emit('signal', {
              type: 'answer',
              sdp: answer,
              from: this.socket.id,
              to: fromUserId
            });
          }
          break;

        case 'answer':
          if (data.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
          }
          break;

        case 'candidate':
          if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
          break;
      }
    } catch (error) {
      console.error('Error handling signal:', error);
      this.emit('error', error);
    }
  }

  public async openRoom(roomId: string): Promise<boolean> {
    try {
      this.currentRoomId = roomId;
      this.isBroadcaster = true;
      
      // Obtener stream local
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });

      // Emitir evento local stream
      const streamEvent: StreamEvent = {
        stream: this.localStream,
        userid: this.userId,
        type: 'local'
      };
      this.emit('localStream', streamEvent.stream, streamEvent.userid);

      // Unirse a la sala como broadcaster
      this.socket.emit('join-room', {
        roomId: roomId,
        userId: this.socket.id,
        isBroadcaster: true
      });

      this.isConnected = true;
      
      const roomEvent: RoomEvent = {
        roomid: roomId,
        isRoomOpened: true
      };
      this.emit('roomOpened', roomEvent.roomid);

      return true;
    } catch (error) {
      console.error('Error opening room:', error);
      this.emit('error', error);
      return false;
    }
  }

  public async joinRoom(roomId: string): Promise<boolean> {
    try {
      this.currentRoomId = roomId;
      this.isBroadcaster = false;

      // Unirse a la sala como viewer
      this.socket.emit('join-room', {
        roomId: roomId,
        userId: this.socket.id,
        isBroadcaster: false
      });

      this.isConnected = true;
      
      const roomEvent: RoomEvent = {
        roomid: roomId,
        isJoined: true
      };
      this.emit('roomJoined', roomEvent.roomid);

      return true;
    } catch (error) {
      console.error('Error joining room:', error);
      this.emit('error', error);
      return false;
    }
  }

  public leaveRoom(): void {
    if (this.isConnected && this.currentRoomId) {
      this.socket.emit('leave-room', {
        roomId: this.currentRoomId,
        userId: this.socket.id
      });

      // Cerrar todas las conexiones peer
      this.peerConnections.forEach((pc, userId) => {
        pc.close();
        this.emit('streamEnded', userId);
      });
      this.peerConnections.clear();

      // Detener stream local
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      this.isConnected = false;
      this.currentRoomId = null;
      this.isBroadcaster = false;
      
      console.log('Left room');
    }
  }

  private closePeerConnection(userId: string): void {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
    }
  }

  // Sistema de eventos
  public on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  public emit(event: string, ...args: any[]): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => {
        callback(...args);
      });
    }
  }

  // Obtener estado
  public getStatus(): {
    isConnected: boolean;
    roomId: string | null;
    isInitiator: boolean;
  } {
    return {
      isConnected: this.isConnected,
      roomId: this.currentRoomId,
      isInitiator: this.isBroadcaster
    };
  }
}
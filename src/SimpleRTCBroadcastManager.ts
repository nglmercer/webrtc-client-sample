// src/SimpleRTCBroadcastManager.ts

import { io, Socket } from 'socket.io-client';

// Tipos para nuestros eventos, reflejando tu API original
type RtcEvent = 'localStream' | 'remoteStream' | 'streamEnded' | 'roomOpened' | 'roomJoined' | 'error' | 'userLeft';
type RtcEventListener = (...args: any[]) => void;

// Configuración de los servidores ICE
const DEFAULT_ICE_SERVERS = {
  iceServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
};

export class SimpleRTCBroadcastManager {
  private socket: Socket | null = null;
  private localStream: MediaStream | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private eventListeners: Map<RtcEvent, RtcEventListener[]> = new Map();
  
  private signalingUrl: string;
  private signalingEventName: string; // Tu 'video-broadcast-demo'
  private isBroadcaster: boolean = false;
  private roomId: string | null = null;
  public userId: string | null = null;

  constructor(signalingUrl: string, signalingEventName: string) {
    this.signalingUrl = signalingUrl;
    this.signalingEventName = signalingEventName;
  }

  // --- Sistema de Eventos (igual que el tuyo) ---
  public on(event: RtcEvent, callback: RtcEventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  private emit(event: RtcEvent, ...args: any[]): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => callback(...args));
    }
  }

  // --- Métodos Públicos (API principal) ---

  /**
   * Abre una sala como el broadcaster.
   * Obtiene el stream local y espera a que los viewers se unan.
   */
  public async openRoom(roomId: string): Promise<void> {
    this.isBroadcaster = true;
    this.roomId = roomId;

    try {
      // 1. Obtener stream de audio/video local
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      this.emit('localStream', this.localStream, 'local'); // Emitir stream local
      
      // 2. Conectar al servidor de señalización
      this.connectToSignalingServer();
    } catch (error) {
      console.error("Error al obtener media o abrir la sala:", error);
      this.emit('error', error);
    }
  }

  /**
   * Se une a una sala existente como viewer.
   * No obtiene stream local, solo se prepara para recibir.
   */
  public async joinRoom(roomId: string): Promise<void> {
    this.isBroadcaster = false;
    this.roomId = roomId;
    this.connectToSignalingServer();
    this.emit('roomJoined', roomId);
  }

  /**
   * Abandona la sala y limpia todos los recursos.
   */
  public leaveRoom(): void {
    if (!this.socket) return;

    // Detener stream local si somos el broadcaster
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Cerrar todas las conexiones de peers
    this.peers.forEach(peer => peer.close());
    this.peers.clear();

    // Desconectar del socket
    this.socket.disconnect();
    this.socket = null;

    this.emit('streamEnded', 'all'); // Limpiar UI
    console.log("Se ha abandonado la sala y limpiado los recursos.");
  }


  // --- Lógica Interna de WebRTC y Señalización ---

  private connectToSignalingServer(): void {
    if (this.socket) return; // Ya conectado

    this.socket = io(this.signalingUrl);

    this.socket.on('connect', () => {
      this.userId = String(this.socket!.id);
      console.log(`Conectado a la señalización con ID: ${this.userId}`);
      
      // Mensaje estándar para unirse a la sala que el servidor de RTCMultiConnection espera
      this.socket!.emit('open-or-join-room', {
        roomid: this.roomId,
        // Podemos enviar metadatos extra si es necesario
        extra: { isBroadcaster: this.isBroadcaster } 
      });

      if (this.isBroadcaster) {
        this.emit('roomOpened', this.roomId);
      }
    });

    // El servidor nos notifica de un nuevo viewer que se ha unido
    this.socket.on('new-peer-connected', (remoteUserId: string) => {
      // Solo el broadcaster debe reaccionar a esto para iniciar la conexión
      if (this.isBroadcaster) {
        console.log(`Viewer ${remoteUserId} se ha unido. Iniciando conexión...`);
        this.createPeerConnection(remoteUserId);
      }
    });

    // Manejar los mensajes de señalización (ofertas, respuestas, candidatos)
    this.socket.on(this.signalingEventName, (data: any) => {
      this.handleSignalingMessage(data);
    });

    // Manejar la desconexión de un usuario
    this.socket.on('user-disconnected', (remoteUserId: string) => {
      console.log(`Usuario ${remoteUserId} se ha desconectado.`);
      this.cleanupPeer(remoteUserId);
    });
  }

  private async createPeerConnection(remoteUserId: string): Promise<void> {
    const peer = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
    this.peers.set(remoteUserId, peer);

    // Enviar candidatos ICE al otro peer
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage(remoteUserId, {
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    // Esto es para los viewers: cuando una pista de video/audio llega
    peer.ontrack = (event) => {
      console.log(`Track recibido de ${remoteUserId}`);
      this.emit('remoteStream', event.streams[0], remoteUserId);
    };

    // Gestionar el estado de la conexión
    peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
            this.cleanupPeer(remoteUserId);
        }
    }
    
    // Si somos el broadcaster, añadimos nuestras pistas y creamos la oferta
    if (this.isBroadcaster && this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream!);
      });

      const offer = await peer.createOffer({
        // Replicamos la configuración de tu sdpConstraints
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await peer.setLocalDescription(offer);

      this.sendSignalingMessage(remoteUserId, {
        type: 'offer',
        sdp: peer.localDescription,
      });
    }
  }

  private async handleSignalingMessage(data: { sender: string; message: any }): Promise<void> {
    const { sender, message } = data;
    const { type, sdp, candidate } = message;

    // Si aún no tenemos una conexión con este peer, la creamos.
    // Esto es crucial para el viewer que recibe la oferta inicial.
    if (!this.peers.has(sender)) {
      await this.createPeerConnection(sender);
    }
    const peer = this.peers.get(sender)!;

    try {
      if (type === 'offer') {
        await peer.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await peer.createAnswer(); // Por defecto, createAnswer respeta la oferta y ofrecerá recibir
        await peer.setLocalDescription(answer);
        this.sendSignalingMessage(sender, {
          type: 'answer',
          sdp: peer.localDescription,
        });
      } else if (type === 'answer') {
        await peer.setLocalDescription(sdp);
      } else if (type === 'candidate') {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
        console.error("Error manejando el mensaje de señalización:", error);
        this.emit('error', error);
    }
  }

  private cleanupPeer(remoteUserId: string): void {
    const peer = this.peers.get(remoteUserId);
    if (peer) {
      peer.close();
      this.peers.delete(remoteUserId);
      this.emit('streamEnded', remoteUserId);
      this.emit('userLeft', remoteUserId); // Un evento más específico
      console.log(`Limpieza completa para el peer ${remoteUserId}.`);
    }
  }

  private sendSignalingMessage(to: string, message: any): void {
    this.socket?.emit(this.signalingEventName, {
      to,
      sender: this.userId,
      message,
    });
  }
}
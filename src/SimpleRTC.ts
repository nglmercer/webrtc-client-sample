// SimpleRTC.ts
import { io, Socket } from 'socket.io-client';

// Tipos para nuestros eventos personalizados
type RtcEvent = 'connected' | 'peer-joined' | 'peer-left' | 'message';
type RtcEventListener = (...args: any[]) => void;

// Configuración por defecto para los servidores STUN
const DEFAULT_ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class SimpleRTC {
  private socket: Socket;
  private roomId: string;
  public userId: string | null = null;
  
  // Usamos Mapas para gestionar múltiples conexiones de peers
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private eventListeners: Map<RtcEvent, RtcEventListener[]> = new Map();

  constructor(signalingServerUrl: string, roomId: string) {
    this.roomId = roomId;
    this.socket = io(signalingServerUrl);
  }

  // Método para registrarse a eventos
  public on(event: RtcEvent, listener: RtcEventListener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  // Método para emitir nuestros eventos internos
  private emit(event: RtcEvent, ...args: any[]) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(listener => listener(...args));
    }
  }

  // Inicia la conexión
  public connect() {
    this.setupSocketListeners();
  }
  
  // Configura todos los listeners del socket de señalización
  private setupSocketListeners() {
    this.socket.on('connect', () => {
      this.userId = String(this.socket.id);
      console.log(`Conectado al servidor de señalización con ID: ${this.userId}`);
      this.emit('connected', this.userId);
      
      // El mensaje que espera el servidor de RTCMultiConnection para unirse a una sala
      this.socket.emit('open-or-join-room', this.roomId);
    });

    // El servidor nos envía un mensaje de otro peer
    // Este es el manejador principal para el flujo de señalización de WebRTC
    this.socket.on('message', (data: any) => {
      console.log('Mensaje de señalización recibido:', data);
      this.handleSignalingMessage(data);
    });

    // Este es un evento personalizado que el servidor de RTCMultiConnection emite.
    // Nos informa de un nuevo peer que se ha unido a la sala y con el cual debemos conectar.
    this.socket.on('new-peer-connected', (remoteUserId: string) => {
      console.log(`Nuevo peer conectado: ${remoteUserId}. Iniciando conexión.`);
      this.createPeerConnection(remoteUserId, true); // Somos los iniciadores
    });
    
    // El peer se ha desconectado
    this.socket.on('user-disconnected', (remoteUserId: string) => {
        console.log(`Peer desconectado: ${remoteUserId}`);
        this.cleanupPeer(remoteUserId);
    });
  }

  // Crea y configura una nueva RTCPeerConnection
  private async createPeerConnection(remoteUserId: string, isInitiator: boolean) {
    if (this.peers.has(remoteUserId)) {
        console.warn(`Ya existe una conexión con el peer ${remoteUserId}`);
        return;
    }
      
    const peer = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
    this.peers.set(remoteUserId, peer);

    // Enviar candidatos ICE al otro peer a través del servidor de señalización
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          to: remoteUserId,
          message: {
            type: 'candidate',
            candidate: event.candidate,
          },
        });
      }
    };

    // Si el otro peer crea un canal de datos, lo recibimos aquí
    peer.ondatachannel = (event) => {
      console.log(`Canal de datos recibido de ${remoteUserId}`);
      const channel = event.channel;
      this.setupDataChannel(channel, remoteUserId);
    };

    // Gestionar cambios en el estado de la conexión
    peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'disconnected' || peer.connectionState === 'closed' || peer.connectionState === 'failed') {
            console.log(`Conexión con ${remoteUserId} perdida.`);
            this.cleanupPeer(remoteUserId);
        }
    }

    // Si somos los que iniciamos la conexión, creamos el canal de datos y la oferta
    if (isInitiator) {
      const dataChannel = peer.createDataChannel('data');
      this.setupDataChannel(dataChannel, remoteUserId);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      
      this.sendSignalingMessage({
        to: remoteUserId,
        message: {
          type: 'offer',
          sdp: peer.localDescription,
        },
      });
    }
  }
  
  // Maneja los mensajes de señalización (oferta, respuesta, candidato ICE)
  private async handleSignalingMessage(data: { sender: string; message: any }) {
    const { sender, message } = data;
    const { type, sdp, candidate } = message;

    let peer = this.peers.get(sender);

    try {
        if (type === 'offer') {
            if (!peer) {
                // Si recibimos una oferta, significa que el otro peer inició la conexión
                await this.createPeerConnection(sender, false);
                peer = this.peers.get(sender)!;
            }
            await peer.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
    
            this.sendSignalingMessage({
            to: sender,
            message: {
                type: 'answer',
                sdp: peer.localDescription,
            },
            });
        } else if (type === 'answer' && peer) {
            await peer.setRemoteDescription(new RTCSessionDescription(sdp));
        } else if (type === 'candidate' && peer) {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error("Error al manejar mensaje de señalización:", error);
    }
  }

  // Configura los listeners para un RTCDataChannel
  private setupDataChannel(channel: RTCDataChannel, remoteUserId: string) {
    channel.onopen = () => {
      console.log(`Canal de datos con ${remoteUserId} está abierto!`);
      this.dataChannels.set(remoteUserId, channel);
      this.emit('peer-joined', remoteUserId);
    };

    channel.onmessage = (event) => {
      console.log(`Mensaje recibido de ${remoteUserId}: ${event.data}`);
      this.emit('message', { sender: remoteUserId, data: event.data });
    };
    
    channel.onclose = () => {
      console.log(`Canal de datos con ${remoteUserId} se ha cerrado.`);
      this.cleanupPeer(remoteUserId);
    }
  }
  
  // Limpia los recursos de un peer desconectado
  private cleanupPeer(remoteUserId: string) {
    this.peers.get(remoteUserId)?.close();
    this.peers.delete(remoteUserId);
    this.dataChannels.delete(remoteUserId);
    this.emit('peer-left', remoteUserId);
  }

  // Envía un mensaje a un peer específico o a todos (broadcast)
  public send(message: string, targetUserId?: string) {
    if (targetUserId) {
        const channel = this.dataChannels.get(targetUserId);
        if (channel?.readyState === 'open') {
            channel.send(message);
        } else {
            console.warn(`No se puede enviar mensaje. El canal con ${targetUserId} no está abierto.`);
        }
    } else {
        // Broadcast a todos los peers conectados
        this.dataChannels.forEach((channel) => {
            if(channel.readyState === 'open') {
                channel.send(message);
            }
        });
    }
  }

  // Función de ayuda para enviar mensajes a través de socket.io
  private sendSignalingMessage(payload: any) {
    this.socket.emit('message', payload);
  }
  
  // Desconecta y limpia todo
  public disconnect() {
    this.peers.forEach((peer, userId) => {
        this.cleanupPeer(userId);
    });
    this.socket.disconnect();
    console.log("Desconectado de todo.");
  }
}
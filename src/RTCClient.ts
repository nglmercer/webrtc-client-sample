import type{ RTCClientConfig, SessionConfig, RTCClientEvent, RTCClientEventListener, IRTCMultiConnection } from './types';
const defaultsessionConfig ={
        audio: true, // Recibir audio
        video: true, // Recibir video
        oneway: true // Configuración para recepción
}
export class RTCClient {
  private connection: IRTCMultiConnection | null = null;
  private eventListeners: Map<RTCClientEvent, RTCClientEventListener[]> = new Map();
  public isConnected: boolean = false;
  public currentRoomId: string | null = null;
  private config: RTCClientConfig;

  constructor(config: RTCClientConfig) {
    this.config = {
      socketMessageEvent: 'RTCMultiConnection-Message', // Valor por defecto del servidor
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], // STUN por defecto
      ...config
    };
    this.initConnection();
  }

  private initConnection(): void {
    // Espera a que RTCMultiConnection esté disponible globalmente
    // (asumiendo que se carga vía <script> en el HTML del cliente final)
    if (typeof window.RTCMultiConnection === 'undefined') {
      console.warn('RTCMultiConnection no encontrado, reintentando...');
      setTimeout(() => this.initConnection(), 200);
      return;
    }

    this.connection = new window.RTCMultiConnection();
    this.connection.socketURL = this.config.socketURL;
    this.connection.socketMessageEvent = this.config.socketMessageEvent!;
    this.connection.iceServers = this.config.iceServers!;

    this.setupConnectionEvents();
    console.log('RTCClient: Conexión inicializada');
  }

  private setupConnectionEvents(): void {
    if (!this.connection) return;

    this.connection.onstream = (event) => {
      console.log('RTCClient: Stream recibido', event.type, event.userid);
      if (event.type === 'local') {
        this.emit('localStream', event.stream, event.userid);
      } else {
        this.emit('remoteStream', event.stream, event.userid);
      }
    };

    this.connection.onstreamended = (event) => {
      console.log('RTCClient: Stream finalizado', event.userid);
      this.emit('streamEnded', event.userid);
    };

    this.connection.onopen = (event) => {
      console.log('RTCClient: Sesión abierta/usuario unido', event.roomid, event.userid);
      // El servidor emite 'user-connected'/'user-disconnected'
      // Puedes escucharlos directamente o usar onUserStatusChanged si RTCMultiConnection lo soporta
      // Aquí asumimos que el evento 'open' indica que la conexión está lista
      this.isConnected = true;
      // Diferenciar entre abrir y unirse puede ser complejo solo con onopen.
      // Podríamos usar banderas internas o confiar en open/join callbacks.
      // Por ahora, emitimos roomOpened/Joned basado en la acción del usuario.
    };

    this.connection.onUserStatusChanged = (event) => {
         if(event.status === 'online') {
             this.emit('userConnected', event.userid);
         } else if(event.status === 'offline') {
             this.emit('userDisconnected', event.userid);
         }
    };


    this.connection.onMediaError = (error) => {
      console.error('RTCClient: Error de medio', error);
      this.emit('error', new Error(`Media Error: ${error}`));
    };

    this.connection.onerror = (error) => {
      console.error('RTCClient: Error de conexión', error);
      this.emit('error', new Error(`Connection Error: ${error}`));
    };

    // Escuchar eventos personalizados del servidor si se envían
    // Esto depende de cómo los envíe el servidor
    // this.connection.on('custom-server-event', (data) => { ... });
  }


  public on(event: RTCClientEvent, callback: RTCClientEventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  public off(event: RTCClientEvent, callback: RTCClientEventListener): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: RTCClientEvent, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(...args);
        } catch (e) {
          console.error(`Error en listener para evento ${event}:`, e);
        }
      });
    }
  }

  public async openRoom(roomId: string, sessionConfig: SessionConfig=defaultsessionConfig): Promise<boolean> {
    if (!this.connection) {
      this.emit('error', new Error('Conexión no inicializada'));
      return false;
    }
    if (this.isConnected) {
       this.emit('error', new Error('Ya estás conectado a una sala. Sal primero.'));
       return false;
    }

    return new Promise((resolve) => {
      try {
        this.connection!.session = sessionConfig;
        // Configurar SDP para emisor (oneway)
        if (sessionConfig.oneway || sessionConfig.broadcast) {
           this.connection!.sdpConstraints.mandatory = {
             OfferToReceiveAudio: false,
             OfferToReceiveVideo: false
           };
        }
        this.currentRoomId = roomId;

        this.connection!.open(roomId, (isRoomOpened, roomid, error) => {
          if (error) {
            console.error('RTCClient: Error al abrir sala', error);
            this.emit('error', new Error(`Open Room Error: ${error}`));
            resolve(false);
            return;
          }
          if (isRoomOpened) {
            this.isConnected = true; // Ya se establece en onopen, pero por si acaso
            console.log('RTCClient: Sala abierta', roomid);
            this.emit('roomOpened', roomid);
            resolve(true);
          } else {
             resolve(false);
          }
        });
      } catch (error: any) {
        console.error('RTCClient: Excepción al abrir sala', error);
        this.emit('error', error);
        resolve(false);
      }
    });
  }

  public async joinRoom(roomId: string, sessionConfig: SessionConfig=defaultsessionConfig): Promise<boolean> {
    if (!this.connection) {
      this.emit('error', new Error('Conexión no inicializada'));
      return false;
    }
    if (this.isConnected) {
       this.emit('error', new Error('Ya estás conectado a una sala. Sal primero.'));
       return false;
    }

    return new Promise((resolve) => {
      try {
        this.connection!.session = sessionConfig;
         // Configurar SDP para receptor (oneway)
        if (sessionConfig.oneway || sessionConfig.broadcast) {
           this.connection!.sdpConstraints.mandatory = {
             OfferToReceiveAudio: true,
             OfferToReceiveVideo: true
           };
        }
        this.currentRoomId = roomId;

        this.connection!.join(roomId, (isJoined, roomid, error) => {
          if (error) {
            console.error('RTCClient: Error al unirse a sala', error);
            this.emit('error', new Error(`Join Room Error: ${error}`));
            resolve(false);
            return;
          }
          if (isJoined) {
            this.isConnected = true;
            console.log('RTCClient: Unido a sala', roomid);
            this.emit('roomJoined', roomid);
            resolve(true);
          } else {
             resolve(false);
          }
        });
      } catch (error: any) {
        console.error('RTCClient: Excepción al unirse a sala', error);
        this.emit('error', error);
        resolve(false);
      }
    });
  }

  public leaveRoom(): void {
    if (this.connection && this.isConnected) {
      try {
        this.connection.leave();
        this.connection.closeSocket(); // Cierra la conexión del socket
        this.isConnected = false;
        const roomId = this.currentRoomId;
        this.currentRoomId = null;
        console.log('RTCClient: Sala dejada');
        this.emit('roomClosed', roomId); // Emitir evento de sala cerrada
        // Limpiar streams locales/remotos es responsabilidad del consumidor
        // o podrías emitir 'streamEnded' para todos si lo deseas aquí.
      } catch (error: any) {
        console.error('RTCClient: Error al dejar la sala', error);
        this.emit('error', error);
      }
    }
  }

  public getStatus() {
    return {
      isConnected: this.isConnected,
      roomId: this.currentRoomId,
      // isInitiator podría obtenerse de this.connection.isInitiator si está disponible
    };
  }

  // Método para actualizar extra data (si tu servidor lo soporta)
  public updateExtraData(extra: any): void {
     if(this.connection) {
         // Asumiendo que RTCMultiConnection tiene un método para esto
         // this.connection.extra = extra;
         // this.connection.updateExtraData(); // O similar
         // O emitir un evento personalizado al servidor
         // this.connection.socket.emit('extra-data-updated', extra);
         console.warn('Actualización de extra data no implementada directamente en esta lib.');
     }
  }

  // Método para obtener el objeto de conexión subyacente (usar con cuidado)
  public getConnection(): IRTCMultiConnection | null {
      return this.connection;
  }
}

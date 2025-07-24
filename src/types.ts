// Tipos para eventos y configuración
export interface RTCClientConfig {
  socketURL: string; // URL de tu servidor de señalización
  socketMessageEvent?: string; // Evento personalizado (por defecto en el servidor parece 'RTCMultiConnection-Message')
  iceServers?: RTCIceServer[]; // Servidores ICE personalizados
  // Puedes añadir más opciones de configuración aquí
}

export interface SessionConfig {
  audio: boolean;
  video: boolean;
  oneway?: boolean; // Emisor (broadcast)
  broadcast?: boolean; // Similar a oneway
  data?: boolean;
  // ... otras opciones de sesión
}

export type RTCClientEvent =
  | 'localStream'
  | 'remoteStream'
  | 'streamEnded'
  | 'roomOpened'
  | 'roomJoined'
  | 'roomClosed' // Puedes añadir más
  | 'userConnected'
  | 'userDisconnected'
  | 'error';

export type RTCClientEventListener = (...args: any[]) => void;

// Aproximación básica al tipo de RTCMultiConnection si no tienes definiciones oficiales
// Puedes refinar esto según las propiedades y métodos que uses
export interface IRTCMultiConnection {
  socketURL: string;
  socketMessageEvent: string;
  session: SessionConfig;
  sdpConstraints: any;
  iceServers: RTCIceServer[];
  userid?: string; // Asignado por el servidor si no se proporciona

  open(roomid: string, callback?: (isRoomOpened: boolean, roomid: string, error?: string) => void): void;
  join(roomid: string, callback?: (isJoined: boolean, roomid: string, error?: string) => void): void;
  leave(): void;
  closeSocket(): void;
  // Eventos como propiedades (simplificados)
  onstream?: (event: any) => void;
  onstreamended?: (event: any) => void;
  onopen?: (event: any) => void;
  onerror?: (error: any) => void;
  onMediaError?: (error: any) => void;
  onUserStatusChanged?: (event: any) => void; // Para user-connected/disconnected
  // ... otros métodos y eventos
}

// Declaración global para RTCMultiConnection si se carga vía <script>
declare global {
  interface Window {
    RTCMultiConnection: new () => IRTCMultiConnection;
  }
}
// Si lo usas como módulo, podrías importarlo de otro modo

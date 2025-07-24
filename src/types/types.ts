// Tipos para identificar el origen de un stream o un evento
export type StreamType = 'local' | 'remote';
export type MuteType = 'audio' | 'video' | 'both';
export type ConnectionStatus = 'online' | 'offline';

// Evento para cuando se recibe o se termina un stream de audio/video.
export interface StreamEvent {
  stream: MediaStream;
  streamid: string;
  type: StreamType;
  userid: string;
  extra: Record<string, any>;
  mediaElement?: HTMLVideoElement | HTMLAudioElement;
  // Propiedades adicionales para eventos de mute/unmute
  session?: { audio: boolean; video: boolean };
  muteType?: MuteType;
  unmuteType?: MuteType;
}

// Evento para la apertura o cierre de un canal de datos.
export interface DataChannelEvent {
  userid: string;
  extra: Record<string, any>;
  channel?: RTCDataChannel; // Presente en onopen
}

// Evento para la recepción de un mensaje a través del canal de datos.
export interface MessageEvent {
  data: any; // Puede ser string, JSON, ArrayBuffer, etc.
  userid: string;
  extra: Record<string, any>;
  latency?: number;
  original?: any; // Utilizado por el traductor
}

// Evento para cuando un usuario se une o se va.
export interface ConnectionStateChangeEvent {
  userid: string;
  extra: Record<string, any>;
}

// Evento para el cambio de estado de un usuario (online/offline).
export interface UserStatusEvent {
  userid: string;
  status: ConnectionStatus;
  extra: Record<string, any>;
}

// Evento para el cierre completo de la sesión.
export interface EntireSessionClosedEvent {
  sessionid: string;
  userid: string;
  extra: Record<string, any>;
}

// Evento para el estado de la conexión de un peer.
export interface PeerStateChangedEvent {
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  userid: string;
  extra: Record<string, any>;
}
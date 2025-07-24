import type{ StreamEvent } from './types'
// Describe lo que se quiere transmitir en una sesión.
export interface SessionDescription {
  audio?: boolean;
  video?: boolean;
  screen?: boolean;
  data?: boolean;
  oneway?: boolean;
  broadcast?: boolean;
}

// Configuración de ancho de banda.
export interface Bandwidth {
  audio?: number; // en kbps
  video?: number; // en kbps
  screen?: number; // en kbps
}

// Opciones de códecs de audio y video.
export interface Codecs {
  audio?: 'opus' | 'G722' | string;
  video?: 'VP8' | 'VP9' | 'H264' | string;
}

// Preferencias de un usuario para una conexión peer-to-peer.
export interface UserPreferences {
  extra?: Record<string, any>;
  localPeerSdpConstraints?: RTCOfferOptions;
  remotePeerSdpConstraints?: RTCOfferOptions;
  isOneWay?: boolean;
  isDataOnly?: boolean;
  dontGetRemoteStream?: boolean;
  dontAttachLocalStream?: boolean;
  connectionDescription?: any;
  streamsToShare?: Record<string, any>;
  renegotiatingPeer?: boolean;
  peerRef?: RTCPeerConnection;
  channels?: RTCDataChannel[];
  successCallback?: () => void;
}

// Representa a un peer conectado.
export interface Peer {
  userid: string;
  extra: Record<string, any>;
  peer: RTCPeerConnection;
  channels: RTCDataChannel[];
  streams: MediaStream[];
  addStream(session: SessionDescription): void;
  removeStream(streamid: string): void;
}

// El objeto que gestiona todos los peers.
export interface PeerManager {
    getLength(): number;
    selectFirst(): Peer | undefined;
    getAllParticipants(sender?: string): string[];
    forEach(callback: (peer: Peer) => void): void;
    send(data: any, remoteUserId?: string): void;
    userid: string;
}

// El objeto que gestiona los eventos de streams.
export interface StreamEventsManager {
    streamid: string;
    selectFirst(options?: StreamSelectorOptions): StreamEvent | undefined;
    selectAll(options?: StreamSelectorOptions): StreamEvent[];
}

export interface StreamSelectorOptions {
    local?: boolean;
    remote?: boolean;
    isScreen?: boolean;
    isAudio?: boolean;
    isVideo?: boolean;
    userid?: string;
}

// Opciones para forzar ciertos comportamientos en el constructor.
export interface ForceOptions {
  useDefaultDevices?: boolean;
  autoOpenOrJoin?: boolean;
}
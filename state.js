// state.js
export const appState = {
    socket: null,
    myId: '',
    roomId: '',
    peerId: null,
    peerConnection: null,
    localStream: null,
    isMicEnabled: false, // Micrófono desactivado por defecto
    isInitiator: false,
    status: 'Inicializando...',
    isConnected: false,
};
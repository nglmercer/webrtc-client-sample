// webrtc.js (CORREGIDO Y REFACTORIZADO PARA MULTI-PUNTO)

const ICE_SERVERS = {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
};

export class WebRTCManager {
    constructor(onIceCandidate, onStream, onConnectionStateChange) {
        // CAMBIO: Gestionamos un mapa de pares, no una sola conexión.
        this.peers = new Map(); // K: peerId, V: { connection: RTCPeerConnection, iceQueue: [] }
        this.localStream = null;
        
        // CAMBIO: Los callbacks ahora deben incluir el peerId para dar contexto.
        this.onIceCandidate = onIceCandidate; // (peerId, candidate)
        this.onStream = onStream; // (peerId, stream)
        this.onConnectionStateChange = onConnectionStateChange; // (peerId, state)
    }

    setLocalStream(stream) {
        this.localStream = stream;
    }

    // CAMBIO: Todos los métodos ahora operan sobre un `peerId` específico.
    async createPeerConnection(peerId) {
        if (this.peers.has(peerId)) {
            console.warn(`Ya existe una conexión para el par ${peerId}. Cerrando la anterior.`);
            this.closeConnection(peerId);
        }

        const peerConnection = new RTCPeerConnection(ICE_SERVERS);
        const iceQueue = [];
        this.peers.set(peerId, { connection: peerConnection, iceQueue: iceQueue });

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.onIceCandidate(peerId, event.candidate);
            }
        };

        peerConnection.ontrack = (event) => {
            console.log(`¡Stream remoto recibido de ${peerId}!`);
            this.onStream(peerId, event.streams[0]);
        };

        peerConnection.onconnectionstatechange = () => {
            this.onConnectionStateChange(peerId, peerConnection.connectionState);
        };
        
        return peerConnection;
    }

    async createOffer(peerId) {
        let peer = this.peers.get(peerId);
        if (!peer) {
            await this.createPeerConnection(peerId);
            peer = this.peers.get(peerId);
        }
        
        const offer = await peer.connection.createOffer();
        await peer.connection.setLocalDescription(offer);
        return offer;
    }

    async handleOffer(peerId, offer) {
        let peer = this.peers.get(peerId);
        if (!peer) {
            await this.createPeerConnection(peerId);
            peer = this.peers.get(peerId);
        }

        await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
        await this.processIceQueue(peerId);

        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        return answer;
    }

    async handleAnswer(peerId, answer) {
        const peer = this.peers.get(peerId);
        if (!peer) {
            console.error(`No se encontró conexión para el par ${peerId} al recibir una respuesta.`);
            return;
        }
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
        await this.processIceQueue(peerId);
    }

    async addIceCandidate(peerId, candidate) {
        const peer = this.peers.get(peerId);
        const rtcCandidate = new RTCIceCandidate(candidate);

        if (peer && peer.connection.remoteDescription) {
            await peer.connection.addIceCandidate(rtcCandidate);
        } else if (peer) {
            peer.iceQueue.push(rtcCandidate);
            console.log(`Candidato ICE encolado para el par ${peerId}.`);
        } else {
            console.error(`No se encontró conexión para el par ${peerId} al añadir candidato ICE.`);
        }
    }

    async processIceQueue(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        while (peer.iceQueue.length > 0) {
            const candidate = peer.iceQueue.shift();
            try {
                console.log(`Procesando candidato ICE encolado para ${peerId}...`);
                await peer.connection.addIceCandidate(candidate);
            } catch (error) {
                console.error(`Error al añadir candidato ICE encolado para ${peerId}:`, error);
            }
        }
    }
    
    toggleMic(isEnabled) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = isEnabled;
            });
        }
    }
    toggleCam(isEnabled) {
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = isEnabled;
            });
        }
    }
    closeConnection(peerId) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.connection.close();
            this.peers.delete(peerId);
            console.log(`Conexión con ${peerId} cerrada.`);
        }
    }
    
    closeAllConnections() {
        for (const peerId of this.peers.keys()) {
            this.closeConnection(peerId);
        }
    }
}
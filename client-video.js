// main.js (CORREGIDO Y REFACTORIZADO PARA MULTI-PUNTO)
import { appState } from './state.js';
import { render, setupUIEventListeners, addLocalVideo, addRemoteVideoAndAudio, removeRemoteVideo } from './ui-video.js';
import { SignalingChannel } from './signaling.js';
import { WebRTCManager } from './webrtc.js';

const App = {
    async init() {
        this.setState({ status: 'Inicializando aplicación...' });

        const params = new URLSearchParams(window.location.search);
        appState.myId = params.get('userId');
        appState.roomId = params.get('roomId');
        // CAMBIO LISTENER: Detectar si estamos en modo "solo escucha"
        appState.isListener = params.get('mode') === 'listen'; 

        // CAMBIO LISTENER: Pasar el estado de listener al WebRTCManager

        this.webrtc = new WebRTCManager(
            (peerId, candidate) => this.signaling.sendSignal(peerId, { candidate }),
            (peerId, stream) => this.handleRemoteStream(peerId, stream),
            (peerId, state) => this.handleConnectionStateChange(peerId, state),
            appState.isListener
        );

        if (!appState.myId || !appState.roomId) {
            this.setState({ status: 'Error: Faltan userId y roomId en la URL.' });
            return;
        }

        // CAMBIO LISTENER: Solo pedir micrófono si NO somos un listener.
        if (!appState.isListener) {
            try {
                // CAMBIO: VIDEO - Pedimos video además de audio.
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
                    video: true // Pedimos una resolución de video estándar
                });
                appState.localStream = stream;
                // CAMBIO: VIDEO - Mostramos nuestro propio video en la UI.
                addLocalVideo(stream); 
                
                this.webrtc.setLocalStream(stream);
                this.webrtc.toggleMic(appState.isMicEnabled);
                // CAMBIO: VIDEO - Añadimos estado y control para la cámara.
                this.webrtc.toggleCam(appState.isCamEnabled); 
                this.setState({ status: 'Cámara y audio listos. Conectando...' });
            } catch (error) {
                console.error("Error al obtener audio/video:", error);
                this.setState({ status: 'Error: Se necesita acceso a cámara y micrófono para participar.' });
                return;
            }
        } else {
            appState.isMicEnabled = false; 
            appState.isCamEnabled = false; // CAMBIO: VIDEO - La cámara también está "apagada"
            this.setState({ status: 'Modo escucha activado. Conectando...' });
        }


        this.signaling = new SignalingChannel(
            "http://localhost:9001",
            { userId: appState.myId, roomId: appState.roomId },
            {
                onConnect: () => this.handleSignalConnect(),
                onDisconnect: () => this.handleSignalDisconnect(),
                onMessage: (data) => this.handleSignalMessage(data),
                onUserDisconnected: (peerId) => this.handleUserDisconnected(peerId),
                onRoomOwnerChanged: (data) => this.handleRoomOwnerChanged(data),
            }
        );


        this.signaling.connect();
        setupUIEventListeners({ 
            onMicToggle: () => this.toggleMicrophone(),
            onCamToggle: () => this.toggleCamera() 
        });
        this.render(); // Render inicial
    },

    setState(newState) {
        // CAMBIO: El estado ahora maneja un objeto de pares
        if (newState.peers) {
            // Fusión superficial para no borrar el estado de otros pares
            appState.peers = { ...appState.peers, ...newState.peers };
            delete newState.peers; // Evitar que se sobrescriba directamente
        }
        Object.assign(appState, newState);
        this.render();
    },

    render() {
        render(appState);
    },
    toggleCamera() {
        if (!appState.localStream) return;
        const newCamState = !appState.isCamEnabled;
        this.webrtc.toggleCam(newCamState);
        this.setState({ isCamEnabled: newCamState });
    },
    handleRemoteStream(peerId, stream) {
        // CAMBIO: VIDEO - En lugar de audio, añadimos el elemento de video y audio.
        addRemoteVideoAndAudio(peerId, stream);
    },
    toggleMicrophone() {
        if (!appState.localStream) return;
        const newMicState = !appState.isMicEnabled;
        this.webrtc.toggleMic(newMicState);
        this.setState({ isMicEnabled: newMicState });
    },

    // --- LÓGICA DE SEÑALIZACIÓN (REFACTORIZADA) ---

    handleSignalConnect() {
        this.setState({ status: 'Conectado. Verificando sala...', isConnected: true });
        this.signaling.checkPresence((isPresent, roomId, extra) => {
            const isInitiator = !isPresent;
            this.setState({ isInitiator });

            this.signaling.openOrJoinRoom(isInitiator, (success, error) => {
                if (success) {
                    const status = isInitiator ? 'Sala creada. Esperando a otros...' : 'Unido a la sala. Anunciando presencia...';
                    this.setState({ status });
                    // Si no soy el creador, anuncio mi llegada para que los demás me contacten.
                    if (!isInitiator) {
                        this.signaling.sendNewParticipationRequest(appState.roomId);
                    }
                } else {
                    this.setState({ status: `Error al unirse: ${error}` });
                }
            });
        });
    },

    handleSignalDisconnect() {
        this.setState({ isConnected: false, status: 'Desconectado. Intenta recargar la página.' });
        this.webrtc.closeAllConnections();
        this.setState({ peers: {} }); // Limpiar todos los pares
    },

    async handleSignalMessage({ message, sender }) {
        // Ignorar mensajes propios
        if (sender === appState.myId) return;

        // **CASO 1: Soy un usuario existente y un nuevo usuario quiere unirse.**
        // Tu servidor reenvía la 'newParticipationRequest' a los participantes existentes.
        if (message.newParticipationRequest) {
            console.log(`Recibida petición de participación del nuevo usuario ${sender}.`);
            this.setState({ 
                status: `Conectando con ${sender}...`,
                peers: { [sender]: { status: 'negotiating' } }
            });
            const offer = await this.webrtc.createOffer(sender);
            this.signaling.sendSignal(sender, offer);
            return;
        }
        
        // **CASO 2: Manejo de señales WebRTC (oferta, respuesta, candidato)**
        if (message.isWebRTCSignal) {
            const { signal } = message;

            // **Soy un usuario nuevo y recibo una OFERTA de un usuario existente.**
            if (signal.type === 'offer') {
                console.log(`Recibida oferta de ${sender}.`);
                this.setState({
                    status: `Respondiendo a ${sender}...`,
                    peers: { [sender]: { status: 'negotiating' } }
                });
                const answer = await this.webrtc.handleOffer(sender, signal);
                this.signaling.sendSignal(sender, answer);
            } 
            // **Soy un usuario existente y recibo una RESPUESTA del nuevo usuario.**
            else if (signal.type === 'answer') {
                console.log(`Recibida respuesta de ${sender}.`);
                await this.webrtc.handleAnswer(sender, signal);
            } 
            // **Cualquiera puede recibir un candidato ICE.**
            else if (signal.candidate) {
                await this.webrtc.addIceCandidate(sender, signal.candidate);
            }
        }
    },

    handleUserDisconnected(peerId) {
        console.log(`Usuario ${peerId} se ha desconectado.`);
        this.webrtc.closeConnection(peerId);
        
        const newPeers = { ...appState.peers };
        delete newPeers[peerId];
        this.setState({ peers: newPeers, status: `Usuario ${peerId} se fue.` });

        // CAMBIO: VIDEO - Eliminar su elemento de video de la UI
        removeRemoteVideo(peerId);
    },

    handleRoomOwnerChanged(data) {
        console.log(`El dueño de la sala cambió. Nuevo dueño: ${data.newOwner}`);
        const amINowTheOwner = data.newOwner === appState.myId;
        this.setState({ isInitiator: amINowTheOwner });

        if (amINowTheOwner) {
            this.setState({ status: '¡Ahora eres el dueño de la sala!' });
        }
    },

    // --- LÓGICA WebRTC (REFACTORIZADA) ---
    handleConnectionStateChange(peerId, connectionState) {
        console.log(`Estado de la conexión P2P con ${peerId}: ${connectionState}`);
        
        const currentPeerState = appState.peers[peerId]?.status;
        if (!currentPeerState) return; // Puede que ya se haya desconectado

        switch (connectionState) {
            case 'connected':
                this.setState({
                    peers: { [peerId]: { status: 'connected' } },
                    status: `Conectado a ${peerId}.`
                });
                break;
            case 'disconnected':
            case 'failed':
            case 'closed': // Tratar todos como una desconexión final
                 if (currentPeerState !== 'disconnected') {
                    this.setState({ 
                        peers: { [peerId]: { status: 'disconnected' } },
                        status: `Conexión con ${peerId} perdida.`
                    });
                    this.handleUserDisconnected(peerId);
                }
                break;
        }
    }
};

// Iniciar la aplicación
App.init();

// Nota: Tendrás que actualizar tu `ui.js` para que `render` muestre una lista de pares
// y para implementar `addRemoteAudio(peerId, stream)` y `removeRemoteAudio(peerId)`.
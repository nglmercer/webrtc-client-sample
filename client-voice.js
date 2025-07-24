const App = {
    rootElement: document.getElementById('app'),
    remoteAudio: document.getElementById('remoteAudio'),
    state: {
        socket: null,
        myId: '',
        roomId: '',
        peerId: null, // <<< INICIALIZADO A NULL para más claridad
        peerConnection: null,
        localStream: null,
        isListenOnly: false,
        isInitiator: false,
        status: 'Inicializando...'
    },
    iceCandidateQueue: [],

    templates: {
        voiceView: (state) => `
            <div class="header"><h1>Chat de Voz</h1></div>
            <div class="status-bar">Sala: <strong>${state.roomId}</strong> | Mi ID: <strong>${state.myId}</strong></div>
            <div class="content voice-status">
                <div class="icon" id="statusIcon">${state.isListenOnly ? '🎧' : '🎙️'}</div>
                <p id="statusText">${state.status}</p>
                ${state.peerId ? `<p>Conectado con: <strong class="peer-name">${state.peerId}</strong></p>` : ''}
            </div>
        `
    },

    async init() {
        const params = new URLSearchParams(window.location.search);
        this.state.myId = params.get('userId');
        this.state.roomId = params.get('roomId');
        this.state.isListenOnly = params.get('listenOnly') === 'true';

        if (!this.state.myId || !this.state.roomId) {
            this.setState({ status: 'Error: Faltan parámetros userId y roomId en la URL.' });
            return;
        }

        if (this.state.isListenOnly) {
            this.setState({ status: 'Modo oyente. Conectando...' });
        } else {
            try {
                // <<< MEJORA: Constraints más específicos pueden ayudar en algunos dispositivos
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
                this.state.localStream = stream;
                this.setState({ status: 'Micrófono listo. Conectando...' });
            } catch (error) {
                console.error("Error al acceder al micrófono:", error);
                this.setState({ status: 'Error: Se necesita acceso al micrófono.' });
                return;
            }
        }
        
        this.render();
        this.connect();
    },

    render() {
        this.rootElement.innerHTML = this.templates.voiceView(this.state);
    },
    
    setState(newState) {
        Object.assign(this.state, newState);
        this.render();
    },

    connect() {
        // <<< MEJORA: Evitar múltiples conexiones si se llama accidentalmente de nuevo
        if (this.state.socket) return;

        this.state.socket = io("http://localhost:9001", {
            query: { userid: this.state.myId, sessionid: this.state.roomId }
        });

        this.state.socket.on('connect', () => {
            this.setState({ status: 'Conectado al servidor. Verificando sala...' });
            
            this.state.socket.emit('check-presence', this.state.roomId, (isPresent) => {
                const isInitiator = !isPresent;
                this.setState({ isInitiator: isInitiator });
                
                const action = isInitiator ? 'open-room' : 'join-room';
                const params = { sessionid: this.state.roomId };

                this.state.socket.emit(action, params, (success, error) => {
                    if (success) {
                        this.setState({ status: isInitiator ? 'Sala creada. Esperando a otro usuario...' : 'Unido a la sala. Notificando...' });
                        
                        if (!isInitiator) {
                            // El que se une, notifica al "dueño" de la sala (que tiene el ID de la sala)
                            this.state.socket.emit('RTCMultiConnection-Message', {
                                remoteUserId: this.state.roomId,
                                message: { newParticipationRequest: true, sender: this.state.myId }
                            });
                        }
                    } else {
                        this.setState({ status: `Error al unirse a la sala: ${error}` });
                    }
                });
            });
        });

        this.setupSocketListeners();
    },

    setupSocketListeners() {
        const socket = this.state.socket;

        socket.on('RTCMultiConnection-Message', async (data) => {
            const { message, sender } = data;

            // El iniciador de la sala recibe una petición para unirse
            if (message.newParticipationRequest && this.state.isInitiator) {
                 if (this.state.peerId) {
                    console.log(`Ya conectado con ${this.state.peerId}. Ignorando nuevo usuario ${sender}.`);
                    return;
                }
                console.log(`Petición de ${sender}. Iniciando WebRTC como iniciador.`);
                this.setState({ peerId: sender });
                await this.createPeerConnection(true); // El iniciador crea la conexión y la oferta
                return;
            }
            console.log("message",message,sender)
            if (message.isWebRTCSignal) {
                const { signal } = message;
                console.log("signal",signal)
                // <<< MEJORA: Permitir que la primera señal (oferta) establezca el peerId
                if (!this.state.peerId && signal.type === 'offer') {
                    console.log(`Recibida oferta de ${sender}, estableciendo como peer.`);
                    this.setState({ peerId: sender });
                }

                if (sender !== this.state.peerId) {
                     console.warn(`Señal recibida de un usuario inesperado ${sender}. Se ignora.`);
                     return;
                }

                try {
                    if (signal.type === 'offer') {
                        console.log('Recibida una oferta de', sender);
                        // Asegurarse de que la conexión exista antes de configurar la descripción remota
                        if (!this.state.peerConnection) {
                           await this.createPeerConnection(false); 
                        }
                        
                        this.setState({ status: 'Oferta recibida. Configurando conexión...' });
                        await this.state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
                        await this.processIceQueue(); // Procesar candidatos que llegaron temprano

                        this.setState({ status: 'Creando respuesta...' });
                        const answer = await this.state.peerConnection.createAnswer();
                        await this.state.peerConnection.setLocalDescription(answer);
                        this.sendSignal(answer);
                        console.log('Respuesta creada y enviada.');

                    } else if (signal.type === 'answer') {
                        console.log('Recibida una respuesta de', sender);
                        this.setState({ status: 'Respuesta recibida. Conexión casi lista...' });
                        await this.state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
                        await this.processIceQueue();

                    } else if (signal.candidate) {
                        // Encolar si la conexión no está lista, o añadir directamente si ya lo está.
                        if (this.state.peerConnection && this.state.peerConnection.remoteDescription) {
                            await this.state.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                        } else {
                            this.iceCandidateQueue.push(signal.candidate);
                            console.log('Candidato ICE encolado.');
                        }
                    }
                } catch (error) {
                    console.error('Error procesando la señal WebRTC:', error);
                    this.setState({ status: 'Error en la negociación WebRTC.' });
                }
            }
        });

        socket.on('user-disconnected', (event) => {
            const peerId = event.userid;
            if (this.state.peerId === peerId) {
                this.setState({ status: 'El otro usuario se ha desconectado.', peerId: null });
                if(this.state.peerConnection) {
                    this.state.peerConnection.close();
                    this.state.peerConnection = null;
                }
                this.remoteAudio.srcObject = null;
                // <<< MEJORA: Volver al estado de espera si eres el iniciador
                if (this.state.isInitiator) {
                    this.setState({ status: 'Sala abierta. Esperando a otro usuario...' });
                }
            }
        });
        
        // <<< ELIMINADO: Este listener es redundante y causa problemas de 'race condition'.
        // El peerId debe establecerse a través del flujo de señalización de WebRTC.
        
        socket.on('user-connected', (peerId) => {
            this.setState({ peerId: peerId, view: 'chatting' });
        });
        
    },

    async createPeerConnection(isPeerConnectionInitiator) {
        this.setState({ status: 'Estableciendo conexión P2P...' });
        
        if (this.state.peerConnection) {
            console.log('Cerrando conexión P2P existente.');
            this.state.peerConnection.close();
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
        });
        this.state.peerConnection = pc;

        // <<< LÓGICA MEJORADA: Manejo explícito del modo 'listenOnly'
        if (this.state.isListenOnly) {
            // Si solo escucho, configuro para solo recibir audio.
            pc.addTransceiver('audio', { direction: 'recvonly' });
            console.log("Configurado para solo recibir audio (listenOnly).");
        } else if (this.state.localStream) {
            // Si no, añado mis pistas de audio para enviarlas.
            console.log('Añadiendo pista de audio local a la conexión.');
            this.state.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.state.localStream);
            });
        }

        pc.ontrack = (event) => {
            console.log('¡Stream de audio remoto recibido!');
            if (this.remoteAudio.srcObject !== event.streams[0]) {
                this.remoteAudio.srcObject = event.streams[0];
                console.log('Asignado stream remoto al elemento <audio>.');
                
                // <<< MEJORA: Forzar la reproducción es clave para la mayoría de navegadores
                this.remoteAudio.play().catch(error => {
                    console.error("Error al intentar reproducir el audio automáticamente:", error);
                    this.setState({ status: '¡Conectado! Haz clic para activar el sonido.' });
                });
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({ candidate: event.candidate });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Estado de la conexión P2P: ${pc.connectionState}`);
            // Actualizar el estado de la UI basado en el estado de la conexión
            switch (pc.connectionState) {
                case 'connected':
                    this.setState({ status: '¡Conectado!' });
                    break;
                case 'disconnected':
                case 'failed':
                    this.setState({ status: 'Conexión perdida. Reintentando...' });
                    pc.restartIce();
                    break;
                case 'closed':
                    // El estado ya se maneja en 'user-disconnected'
                    break;
            }
        };

        if (isPeerConnectionInitiator) {
            try {
                this.setState({ status: 'Creando oferta...' });
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.sendSignal(offer);
                console.log('Oferta creada y enviada.');
            } catch (error) {
                console.error('Error al crear la oferta:', error);
                this.setState({ status: 'Error al crear la oferta P2P.' });
            }
        }
    },

    async processIceQueue() {
        while (this.iceCandidateQueue.length > 0) {
            const candidate = this.iceCandidateQueue.shift();
            try {
                console.log('Procesando candidato ICE encolado...');
                await this.state.peerConnection.addIceCandidate(candidate);
            } catch (e) {
                console.error("Error al añadir candidato ICE encolado:", e);
            }
        }
    },

    sendSignal(signal) {
        if (!this.state.peerId) {
            console.error("Intento de enviar señal sin un peerId definido. Esto no debería ocurrir.");
            return;
        }
        const payload = {
            remoteUserId: this.state.peerId,
            message: { isWebRTCSignal: true, sender: this.state.myId, signal: signal }
        };
        this.state.socket.emit('RTCMultiConnection-Message', payload);
    }
};

App.init();
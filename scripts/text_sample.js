        // Objeto principal de la aplicación
        const App = {
            // Contenedor principal de la aplicación
            rootElement: document.getElementById('app'),

            // Estado de la aplicación
            state: {
                view: 'login', // 'login', 'waiting', 'chatting'
                socket: null,
                myId: '',
                roomId: '',
                peerId: '',
                messages: [], // { text: string, type: 'mine' | 'theirs' | 'system' }
            },

            // --- VISTAS DINÁMICAS (con Template Literals) ---

            templates: {
                loginView: () => `
                    <div class="header"><h1>Chat de Señalización</h1></div>
                    <div class="content">
                        <div class="form-group">
                            <label for="userId">Tu Nombre de Usuario</label>
                            <input type="text" id="userId" value="user-${Math.floor(Math.random() * 1000)}">
                        </div>
                        <div class="form-group">
                            <label for="roomId">Nombre de la Sala</label>
                            <input type="text" id="roomId" value="sala-secreta-123">
                        </div>
                        <div class="button-group">
                            <button id="createBtn" class="button button-primary">Crear Sala</button>
                            <button id="joinBtn" class="button button-secondary">Unirse a Sala</button>
                        </div>
                    </div>
                `,
                chatView: (state) => `
                    <div class="header">
                        <h1>Sala: ${state.roomId}</h1>
                    </div>
                    <div class="status-bar" id="statusBar">
                        ${state.peerId ? `Chateando con <strong>${state.peerId}</strong>` : 'Esperando a otro usuario...'}
                    </div>
                    <div class="chat-window">
                        <div class="chat-messages" id="chatMessages">
                            ${state.messages.map(msg => `<div class="message ${msg.type}">${msg.text}</div>`).join('')}
                        </div>
                        <form id="messageForm" class="chat-input-form">
                            <input type="text" id="messageInput" placeholder="Escribe un mensaje..." ${!state.peerId ? 'disabled' : ''}>
                            <button type="submit" class="button button-primary" ${!state.peerId ? 'disabled' : ''}>Enviar</button>
                        </form>
                    </div>
                `,
            },

            // --- LÓGICA DE LA APLICACIÓN ---

            init() {
                // LEEMOS LOS PARÁMETROS DE LA URL
                const params = new URLSearchParams(window.location.search);
                const userId = params.get('userId');
                const roomId = params.get('roomId');
                this.userId = userId;
                this.roomId = roomId;
                if (!userId || !roomId) {
                    this.rootElement.innerHTML = `
                        <div class="header"><h1>Error</h1></div>
                        <div class="content"><p>Faltan parámetros. Por favor, vuelve al <a href="./index.html">Lobby</a>.</p></div>
                    `;
                    return;
                }
                
                // Una vez que tenemos los datos, conectamos
                this.connect(userId, roomId);
            },

            // Función principal para renderizar la vista actual
            render() {
                switch (this.state.view) {
                    case 'chatting':
                    case 'waiting':
                        this.rootElement.innerHTML = this.templates.chatView(this.state);
                        this.addChatListeners();
                        this.scrollToBottom();
                        break;
                    case 'login':
                    default:
                        this.rootElement.innerHTML = this.templates.loginView();
                        this.addLoginListeners();
                        break;
                }
            },
            
            // Actualiza el estado y vuelve a renderizar
            setState(newState) {
                // Fusiona el nuevo estado con el actual
                Object.assign(this.state, newState);
                this.render();
            },

            // --- MANEJADORES DE EVENTOS DEL DOM ---

            addLoginListeners() {
                document.getElementById('createBtn').addEventListener('click', () => {
                    this.connect(true);
                });
                document.getElementById('joinBtn').addEventListener('click', () => {
                    this.connect(false);
                });
            },
            
            addChatListeners() {
                const form = document.getElementById('messageForm');
                if (form) {
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        this.sendMessage();
                    });
                }
            },

            // --- LÓGICA DE CONEXIÓN Y CHAT ---

            connect(isInitiator) {
                this.setState({ myId: this.userId, roomId: this.roomId, messages: [] });

                this.state.socket = io("http://localhost:9001", {
                    query: { userid: this.state.myId, sessionid: this.state.roomId }
                });
                
                this.setupSocketListeners();
                
                this.state.socket.on('connect', () => {
                    this.addMessage(`Conectado al servidor como <strong>${this.state.myId}</strong>.`, 'system');

                    // Lógica para detectar si somos el creador o nos unimos
                    this.state.socket.emit('check-presence', this.state.roomId, (isPresent) => {
                        const isInitiator = !isPresent;
                        const action = isInitiator ? 'open-room' : 'join-room';
                        const params = { sessionid: this.state.roomId };

                        this.state.socket.emit(action, params, (success, error) => {
                            if (success) {
                                this.setState({ view: 'waiting' });
                                this.addMessage(isInitiator ? 'Sala creada. Esperando...' : 'Unido a la sala...', 'system');
                                if (!isInitiator) {
                                    this.state.socket.emit('RTCMultiConnection-Message', {
                                        remoteUserId: this.state.roomId,
                                        message: { newParticipationRequest: true, sender: this.state.myId }
                                    });
                                }
                            } else {
                                alert(`Error: ${error}`);
                                window.location.href = './index.html';
                            }
                        });
                    });
                });
            },

            setupSocketListeners() {
                const socket = this.state.socket;

                socket.on('user-connected', (peerId) => {
                    this.setState({ peerId: peerId, view: 'chatting' });
                    this.addMessage(`¡Usuario <strong>${peerId}</strong> se ha conectado!`, 'system');
                });

                socket.on('user-disconnected', (peerId) => {
                    if (this.state.peerId === peerId) {
                        this.addMessage(`Usuario <strong>${peerId}</strong> se ha desconectado.`, 'system');
                        this.setState({ peerId: '', view: 'waiting' });
                    }
                });

                socket.on('RTCMultiConnection-Message', (message) => {
                    if (message.sender === this.state.peerId && message.message?.type === 'text-message') {
                        this.addMessage(this.escapeHTML(message.message.data), 'theirs');
                    }
                });
            },

            sendMessage() {
                const input = document.getElementById('messageInput');
                const text = input.value.trim();

                if (!text || !this.state.peerId) return;
                
                const messagePayload = {
                    sender: this.state.myId,
                    remoteUserId: this.state.peerId,
                    message: { type: 'text-message', data: text }
                };
                
                this.state.socket.emit('RTCMultiConnection-Message', messagePayload);
                this.addMessage(this.escapeHTML(text), 'mine');
                input.value = '';
                input.focus();
            },

            addMessage(text, type) {
                this.state.messages.push({ text, type });
                this.render(); // Vuelve a renderizar para mostrar el nuevo mensaje
            },

            // --- UTILIDADES ---

            scrollToBottom() {
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            },
            
            escapeHTML(str) {
                const p = document.createElement('p');
                p.appendChild(document.createTextNode(str));
                return p.innerHTML;
            }
        };

        // Iniciar la aplicación
        App.init();
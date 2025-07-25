// signaling.js (CORREGIDO Y MEJORADO)

export class SignalingChannel {
    constructor(serverUrl, userParams, callbacks) {
        this.socket = null;
        this.serverUrl = serverUrl;
        this.userParams = userParams; // { userId, roomId }
        // CAMBIO: Añadimos nuevos callbacks para una lógica más robusta
        this.callbacks = callbacks; // { onConnect, onDisconnect, onMessage, onUserDisconnected, onNewUserJoined, onRoomOwnerChanged }
    }

    connect() {
        this.socket = io(this.serverUrl, {
            query: { userid: this.userParams.userId, sessionid: this.userParams.roomId }
        });

        this.socket.on('connect', this.callbacks.onConnect);
        this.socket.on('disconnect', this.callbacks.onDisconnect);
        
        // El servidor envía mensajes genéricos a este evento
        this.socket.on('RTCMultiConnection-Message', this.callbacks.onMessage);
        
        // El servidor notifica específicamente cuando alguien se va
        // CAMBIO: El servidor envía el ID directamente, no dentro de un objeto 'event'
        this.socket.on('user-disconnected', this.callbacks.onUserDisconnected);
        
        // NUEVO: Escuchamos el evento para cuando el dueño de la sala cambia
        this.socket.on('room-owner-changed', this.callbacks.onRoomOwnerChanged);

        // NUEVO (OPCIONAL PERO RECOMENDADO): Un evento explícito para nuevos usuarios
        // Aunque tu servidor actual reenvía 'newParticipationRequest', un evento dedicado es más limpio.
        // Por ahora, lo manejaremos con el reenvío que ya tienes.
    }
    
    checkPresence(callback) {
        this.socket.emit('check-presence', this.userParams.roomId, callback);
    }

    openOrJoinRoom(isInitiator, callback) {
        const action = isInitiator ? 'open-room' : 'join-room';
        const params = { sessionid: this.userParams.roomId, extra: { name: 'Usuario' } /* Puedes añadir más datos */ };
        this.socket.emit(action, params, callback);
    }
    
    // CAMBIO: Este método ahora lo usará un usuario nuevo para notificar a TODOS en la sala.
    // El servidor se encargará de reenviarlo al 'owner' o a todos, según su lógica.
    // El 'peerId' aquí es el 'roomId' que en tu servidor coincide con el 'ownerId' inicial.
    sendNewParticipationRequest(roomId) {
        this.sendMessage(roomId, { 
            newParticipationRequest: true, 
            sender: this.userParams.userId 
        });
    }

    sendSignal(peerId, signal) {
        this.sendMessage(peerId, { 
            isWebRTCSignal: true, 
            sender: this.userParams.userId, 
            signal: signal 
        });
    }

    sendMessage(remoteUserId, message) {
        if (!this.socket) {
            console.error("Socket no conectado.");
            return;
        }
        // El formato que espera tu servidor es correcto
        this.socket.emit('RTCMultiConnection-Message', { remoteUserId, message });
    }
}
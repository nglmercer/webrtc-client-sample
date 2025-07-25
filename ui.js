// ui.js (MODIFICADO)

// Elementos del DOM cacheados
const rootElement = document.getElementById('app');
export const remoteAudiosContainer = document.getElementById('remote-audios-container');
// << ELIMINADO: No exportamos elementos del DOM directamente.
// export const remoteAudio = document.getElementById('remoteAudio'); 

function getTemplate(state) {
    // Fíjate en el <audio> que hemos añadido al final.
    return `
        <div class="app-container">
            <div class="header"><h1>Chat de Voz</h1></div>
            <div class="status-bar">
                <span class="connection-indicator ${state.isConnected ? 'connected' : ''}"></span>
                Sala: <strong>${state.roomId}</strong> | Mi ID: <strong>${state.myId}</strong>
            </div>
            <div class="voice-status">
                <div class="icon" id="statusIcon">${state.isMicEnabled ? '🎙️' : '🎧'}</div>
                <p class="status-text" id="statusText">${state.status}</p>
                ${state.peerId ? `<p>Conectado con: <strong class="peer-name">${state.peerId}</strong></p>` : ''}
            </div>
            <div class="controls">
                <button class="mic-button ${state.isMicEnabled ? 'active' : ''}" id="micToggle" title="${state.isMicEnabled ? 'Desactivar micrófono' : 'Activar micrófono'}">
                    ${state.isMicEnabled ? '🎤' : '🔇'}
                </button>
            </div>
            <div class="mic-status">
                ${state.isMicEnabled ? 'Micrófono activado' : 'Micrófono desactivado'}
            </div>
            
            <!-- >>> CLAVE: Añadimos el elemento de audio para el stream remoto <<< -->
            <audio id="remoteAudioElement" autoplay playsinline></audio>
        </div>
    `;
}

// render() no necesita cambios, está perfecto.
export function render(state) {
    rootElement.innerHTML = getTemplate(state);
}

// setupUIEventListeners() no necesita cambios, está perfecto.
export function setupUIEventListeners(callbacks) {
    // Usamos delegación de eventos en el contenedor de la app
    rootElement.addEventListener('click', (e) => {
        if (e.target.closest('#micToggle')) { // .closest es un poco más robusto
            callbacks.onMicToggle();
        }
    });
}
/**
 * Crea y añade un elemento de audio para un par remoto.
 * @param {string} peerId - El ID del usuario remoto.
 * @param {MediaStream} stream - El stream de medios recibido del par.
 */
export function addRemoteAudio(peerId, stream) {
    // Evitar duplicados
    if (document.getElementById(`audio-${peerId}`)) {
        return;
    }

    console.log(`UI: Creando elemento de audio para ${peerId}`);
    const audioElement = document.createElement('audio');
    audioElement.id = `audio-${peerId}`;
    audioElement.srcObject = stream;
    audioElement.autoplay = true;
    audioElement.playsInline = true; // Importante para móviles

    remoteAudiosContainer.appendChild(audioElement);
    
    // Intenta reproducir el audio, manejando la política de autoplay del navegador
    audioElement.play().catch(error => {
        console.warn(`No se pudo reproducir el audio para ${peerId} automáticamente:`, error);
        // Podrías mostrar un botón de "click para activar sonido" aquí
        statusDiv.innerHTML += `<br/><button onclick="document.getElementById('audio-${peerId}').play()">Activar sonido para ${peerId}</button>`;
    });
}
/**
 * Elimina el elemento de audio de un par que se ha desconectado.
 * @param {string} peerId - El ID del usuario remoto.
 */
export function removeRemoteAudio(peerId) {
    const audioElement = document.getElementById(`audio-${peerId}`);
    if (audioElement) {
        console.log(`UI: Eliminando elemento de audio para ${peerId}`);
        audioElement.srcObject = null; // Limpia el stream
        audioElement.remove();
    }
}
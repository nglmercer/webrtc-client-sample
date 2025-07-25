// Elementos del DOM cacheados
const appRoot = document.getElementById('app');
const localVideoContainer = document.getElementById('local-video-container');
const remoteVideosContainer = document.getElementById('remote-videos-container');

function getAppTemplate(state) {
    // La plantilla principal ahora solo se ocupa de los controles y el estado.
    // Los videos viven en sus propios contenedores para no ser re-renderizados constantemente.
    return `
        <div class="app-container">
            <div class="header"><h1>Video Chat</h1></div>
            <div class="status-bar">
                Sala: <strong>${state.roomId}</strong> | Mi ID: <strong>${state.myId}</strong>
            </div>
            <p class="status-text">${state.status}</p>
            <div class="controls">
                <button id="micToggle" class="${state.isMicEnabled ? 'active' : ''}" title="${state.isMicEnabled ? 'Silenciar' : 'Activar Mic'}">
                    ${state.isMicEnabled ? '🎤' : '🔇'}
                </button>
                <!-- CAMBIO: VIDEO - Botón para la cámara -->
                <button id="camToggle" class="${state.isCamEnabled ? 'active' : ''}" title="${state.isCamEnabled ? 'Apagar Cámara' : 'Encender Cámara'}">
                    ${state.isCamEnabled ? '📷' : '📴'}
                </button>
            </div>
        </div>
    `;
}

export function render(state) {
    // Solo actualiza la parte de la app que contiene los controles/estado
    appRoot.innerHTML = getAppTemplate(state);
}

export function setupUIEventListeners(callbacks) {
    // Usamos delegación de eventos en un contenedor superior si es posible, o en el body.
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('#micToggle')) {
            callbacks.onMicToggle();
        }
        // CAMBIO: VIDEO - Listener para el nuevo botón de cámara
        if (e.target.closest('#camToggle')) {
            callbacks.onCamToggle();
        }
    });
}

/**
 * CAMBIO: VIDEO - Crea y añade el elemento de video para el usuario local.
 * @param {MediaStream} stream - El stream local del usuario (cámara y micro).
 */
export function addLocalVideo(stream) {
    localVideoContainer.innerHTML = ''; // Limpiar por si acaso
    const wrapper = document.createElement('div');
    wrapper.id = 'local-video-wrapper';
    wrapper.className = 'video-wrapper';

    const videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true; // MUY IMPORTANTE: El video local debe estar silenciado.

    const label = document.createElement('div');
    label.className = 'peer-id-label';
    label.textContent = 'Tú (local)';

    wrapper.appendChild(videoElement);
    wrapper.appendChild(label);
    localVideoContainer.appendChild(wrapper);
}

/**
 * CAMBIO: VIDEO - Crea y añade un elemento de video para un par remoto.
 * @param {string} peerId - El ID del usuario remoto.
 * @param {MediaStream} stream - El stream recibido del par.
 */
export function addRemoteVideoAndAudio(peerId, stream) {
    if (document.getElementById(`video-wrapper-${peerId}`)) return; // Evitar duplicados

    const wrapper = document.createElement('div');
    wrapper.id = `video-wrapper-${peerId}`;
    wrapper.className = 'video-wrapper';

    const videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    // No se silencia, queremos escuchar al usuario remoto.

    const label = document.createElement('div');
    label.className = 'peer-id-label';
    label.textContent = peerId;

    wrapper.appendChild(videoElement);
    wrapper.appendChild(label);
    remoteVideosContainer.appendChild(wrapper);

    videoElement.play().catch(e => console.warn(`Autoplay bloqueado para ${peerId}:`, e));
}

/**
 * CAMBIO: VIDEO - Elimina el elemento de video de un par que se ha desconectado.
 * @param {string} peerId - El ID del usuario remoto.
 */
export function removeRemoteVideo(peerId) {
    const wrapper = document.getElementById(`video-wrapper-${peerId}`);
    if (wrapper) {
        wrapper.remove();
    }
}
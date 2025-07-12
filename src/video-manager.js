export class VideoManager {
  constructor() {
    this.videosContainer = document.getElementById('videos-container');
    this.videos = new Map();
  }

  addLocalVideo(stream, userid) {
    this.addVideo(stream, userid, `Your video (${userid})`, true);
  }

  addRemoteVideo(stream, userid) {
    this.addVideo(stream, userid, `Participant: ${userid}`, false);
  }

  addVideo(stream, userid, label, isLocal = false) {
    // Remove existing video if it exists
    this.removeVideo(userid);

    // Create video container
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video-${userid}`;
    
    if (isLocal) {
      videoContainer.classList.add('local-video');
    }

    // Create video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal; // Mute only local video to prevent feedback
    video.controls = false;
    
    // Set video source
    try {
      video.srcObject = stream;
    } catch (error) {
      console.warn('srcObject not supported, using URL.createObjectURL');
      video.src = URL.createObjectURL(stream);
    }

    // Create label
    const videoLabel = document.createElement('div');
    videoLabel.className = 'video-label';
    videoLabel.textContent = label;

    // Assemble components
    videoContainer.appendChild(video);
    videoContainer.appendChild(videoLabel);
    this.videosContainer.appendChild(videoContainer);

    // Store reference
    this.videos.set(userid, {
      container: videoContainer,
      video: video,
      stream: stream,
      isLocal: isLocal
    });

    // Ensure video plays
    video.play().catch(error => {
      console.warn('Error playing video:', error);
      // Try to play again after a short delay
      setTimeout(() => {
        video.play().catch(e => console.warn('Second play attempt failed:', e));
      }, 1000);
    });

    console.log(`Video added: ${userid} - ${label}`);
  }

  removeVideo(userid) {
    if (userid === 'all') {
      // Remove all videos
      this.videos.forEach((videoData, id) => {
        this.removeVideo(id);
      });
      return;
    }

    const videoData = this.videos.get(userid);
    if (videoData) {
      // Stop the stream if it's local
      if (videoData.isLocal && videoData.stream) {
        videoData.stream.getTracks().forEach(track => track.stop());
      }
      
      // Clean up video element
      if (videoData.video.srcObject) {
        videoData.video.srcObject = null;
      } else if (videoData.video.src) {
        URL.revokeObjectURL(videoData.video.src);
        videoData.video.src = '';
      }
      
      // Remove from DOM
      videoData.container.remove();
      
      // Remove from collection
      this.videos.delete(userid);
      
      console.log(`Video removed: ${userid}`);
    }
  }

  clearAllVideos() {
    this.removeVideo('all');
    console.log('All videos cleared');
  }

  getVideoCount() {
    return this.videos.size;
  }

  hasVideo(userid) {
    return this.videos.has(userid);
  }

  // Get video element for a specific user
  getVideo(userid) {
    const videoData = this.videos.get(userid);
    return videoData ? videoData.video : null;
  }

  // Mute/unmute a specific video
  toggleMute(userid) {
    const videoData = this.videos.get(userid);
    if (videoData && !videoData.isLocal) {
      videoData.video.muted = !videoData.video.muted;
      return videoData.video.muted;
    }
    return null;
  }
}
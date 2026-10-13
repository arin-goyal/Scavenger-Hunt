/**
 * WebRTC Camera Stream & Frame Capture Engine
 * Supports mobile rear/front flip, torch control, and optimized canvas frame sampling.
 */
class CameraManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.stream = null;
        this.facingMode = 'environment'; // default to rear camera on mobile
        this.hasTorch = false;
        this.torchActive = false;
        this.captureCanvas = document.createElement('canvas');
        this.captureCtx = this.captureCanvas.getContext('2d', { willReadFrequently: true });
        this.isStreaming = false;
    }

    async start(preferredFacing = null) {
        if (preferredFacing) {
            this.facingMode = preferredFacing;
        }

        this.stop();

        // Check if browser API is missing due to insecure HTTP origin
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const isHttpOnIp = location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
            return {
                success: false,
                isHttpRestriction: isHttpOnIp,
                error: isHttpOnIp
                    ? 'Mobile browsers require HTTPS for camera access over Wi-Fi.'
                    : 'Camera API is not supported in this browser.'
            };
        }

        const constraints = {
            audio: false,
            video: {
                facingMode: { ideal: this.facingMode },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 }
            }
        };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            await this.video.play();
            this.isStreaming = true;

            // Check torch capability
            const track = this.stream.getVideoTracks()[0];
            if (track && track.getCapabilities) {
                const caps = track.getCapabilities();
                this.hasTorch = Boolean(caps.torch);
            }

            return { success: true, facingMode: this.facingMode, hasTorch: this.hasTorch, isSimulated: false };
        } catch (err) {
            console.warn('Physical camera unavailable with constraints, attempting generic video:', err);
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                this.video.srcObject = this.stream;
                await this.video.play();
                this.isStreaming = true;
                return { success: true, facingMode: 'user', hasTorch: false, isSimulated: false };
            } catch (fallbackErr) {
                console.warn('Physical camera access failed:', fallbackErr);
                return {
                    success: false,
                    isHttpRestriction: false,
                    error: fallbackErr.message || err.message
                };
            }
        }
    }

    startSimulatedFeed() {
        const simCanvas = document.createElement('canvas');
        simCanvas.width = 640;
        simCanvas.height = 480;
        const simCtx = simCanvas.getContext('2d');

        let frameCount = 0;
        const renderSimFrame = () => {
            if (!this.isStreaming) return;
            frameCount++;
            simCtx.fillStyle = '#14161B';
            simCtx.fillRect(0, 0, 640, 480);

            // Desk surface
            simCtx.fillStyle = '#22252F';
            simCtx.fillRect(0, 320, 640, 160);

            // Visual guide
            simCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            simCtx.font = '12px monospace';
            simCtx.fillText('TEST SENSOR // VIRTUAL CAMERA ACTIVE', 24, 36);
            simCtx.fillText('Point real camera or test object via camera feed', 24, 56);

            requestAnimationFrame(renderSimFrame);
        };

        try {
            if (simCanvas.captureStream) {
                this.stream = simCanvas.captureStream(25);
                this.video.srcObject = this.stream;
                this.video.play().catch(() => {});
                this.isStreaming = true;
                renderSimFrame();
                return { success: true, facingMode: 'simulated', hasTorch: false, isSimulated: true };
            }
        } catch (e) {
            console.warn('captureStream not available:', e);
        }
        return { success: false, error: 'Camera stream unavailable' };
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.isStreaming = false;
        this.torchActive = false;
    }

    async toggleFacing() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        return await this.start(this.facingMode);
    }

    async toggleTorch() {
        if (!this.stream || !this.hasTorch) return false;
        const track = this.stream.getVideoTracks()[0];
        if (!track || !track.applyConstraints) return false;

        try {
            this.torchActive = !this.torchActive;
            await track.applyConstraints({
                advanced: [{ torch: this.torchActive }]
            });
            return this.torchActive;
        } catch (err) {
            console.warn('Torch toggle failed:', err);
            this.torchActive = false;
            return false;
        }
    }

    captureFrame(maxDim = 640, quality = 0.65) {
        if (!this.isStreaming || !this.video.videoWidth || !this.video.videoHeight) {
            return null;
        }

        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;

        let targetW = vw;
        let targetH = vh;

        if (vw > maxDim || vh > maxDim) {
            if (vw > vh) {
                targetW = maxDim;
                targetH = Math.round((vh / vw) * maxDim);
            } else {
                targetH = maxDim;
                targetW = Math.round((vw / vh) * maxDim);
            }
        }

        if (this.captureCanvas.width !== targetW || this.captureCanvas.height !== targetH) {
            this.captureCanvas.width = targetW;
            this.captureCanvas.height = targetH;
        }

        // Draw video frame to canvas
        this.captureCtx.drawImage(this.video, 0, 0, targetW, targetH);
        return this.captureCanvas.toDataURL('image/jpeg', quality);
    }
}

window.CameraManager = CameraManager;

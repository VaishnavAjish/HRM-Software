import { useCallback, useState } from "react";
import CameraCaptureModal from "../components/ui/CameraCaptureModal";

/**
 * One camera-only entry point for every "Add Photo" button.
 *
 * Mobile Web  -> HTML5 File Input with camera capture.
 * Desktop Web -> CameraCaptureModal driving getUserMedia.
 *
 * Usage:
 *   const { requestCapture, cameraModal } = usePhotoCapture({ onCapture: setFile });
 *   <button onClick={requestCapture}>Take Photo</button>
 *   {cameraModal}
 */
export default function usePhotoCapture({ onCapture, front = true } = {}) {
  const [webOpen, setWebOpen] = useState(false);

  const requestCapture = useCallback(() => {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = front ? "user" : "environment";
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          onCapture?.(file);
        }
      };
      input.click();
      return;
    }
    setWebOpen(true);
  }, [front, onCapture]);

  const cameraModal = (
    <CameraCaptureModal
      open={webOpen}
      front={front}
      onCapture={(file) => onCapture?.(file)}
      onClose={() => setWebOpen(false)}
    />
  );

  return { requestCapture, cameraModal, isWebCameraOpen: webOpen };
}

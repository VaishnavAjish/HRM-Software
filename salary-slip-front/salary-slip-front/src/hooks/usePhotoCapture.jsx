import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import CameraCaptureModal from "../components/ui/CameraCaptureModal";
import {
  isNativePlatform,
  captureNativePhoto,
  friendlyCaptureMessage,
  CAPTURE_ERRORS,
} from "../utils/photoCapture";

/**
 * One camera-only entry point for every "Add Photo" button.
 *
 * Native  -> Capacitor Camera with CameraSource.Camera (OS camera app handles
 *            preview/retake/confirm).
 * Web     -> CameraCaptureModal driving getUserMedia.
 *
 * Usage:
 *   const { requestCapture, cameraModal } = usePhotoCapture({ onCapture: setFile });
 *   <button onClick={requestCapture}>Take Photo</button>
 *   {cameraModal}
 */
export default function usePhotoCapture({ onCapture, front = true } = {}) {
  const [webOpen, setWebOpen] = useState(false);

  const requestCapture = useCallback(async () => {
    if (!isNativePlatform()) {
      setWebOpen(true);
      return;
    }
    try {
      const file = await captureNativePhoto({ front });
      onCapture?.(file);
    } catch (err) {
      // Cancelling is a normal outcome, not an error worth shouting about.
      if (err?.code === CAPTURE_ERRORS.CANCELLED) return;
      toast.error(friendlyCaptureMessage(err));
    }
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

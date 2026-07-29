import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Check, X, AlertTriangle, SwitchCamera } from "lucide-react";
import {
  openWebcamStream,
  stopStream,
  grabFrame,
  friendlyCaptureMessage,
  CAPTURE_ERRORS,
  PhotoCaptureError,
} from "../../utils/photoCapture";

/**
 * Web-only camera capture: live getUserMedia preview -> capture -> retake/use.
 * There is no file input here by design; on native platforms the OS camera app
 * provides this flow instead and this modal is never mounted.
 */
export default function CameraCaptureModal({ open, onCapture, onClose, front = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [facingFront, setFacingFront] = useState(front);
  const [shot, setShot] = useState(null); // { file, previewUrl }

  const teardown = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const stream = await openWebcamStream({ front: facingFront });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [facingFront]);

  // Clear any previous shot when the modal transitions to open. Adjusting state
  // during render (rather than in an effect) avoids a cascading re-render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setShot(null);
  }

  // Open/close lifecycle. The stream is always torn down on unmount so the
  // camera indicator does not stay lit after the modal closes.
  useEffect(() => {
    if (!open) {
      teardown();
      return undefined;
    }
    // Acquiring the camera stream is exactly the "synchronise with an external
    // system" case this rule exempts; start() flips its loading flag before the
    // first await, which the rule cannot distinguish from a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    start();
    return teardown;
  }, [open, start, teardown]);

  useEffect(() => {
    return () => {
      if (shot?.previewUrl) URL.revokeObjectURL(shot.previewUrl);
    };
  }, [shot]);

  if (!open) return null;

  const handleCapture = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await grabFrame(videoRef.current);
      teardown();
      setShot({ file, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof PhotoCaptureError ? err : new PhotoCaptureError(CAPTURE_ERRORS.UNKNOWN, ""));
    } finally {
      setBusy(false);
    }
  };

  const handleRetake = () => {
    if (shot?.previewUrl) URL.revokeObjectURL(shot.previewUrl);
    setShot(null);
    start();
  };

  const handleUse = () => {
    if (!shot) return;
    onCapture?.(shot.file);
    if (shot.previewUrl) URL.revokeObjectURL(shot.previewUrl);
    setShot(null);
    onClose?.();
  };

  const handleClose = () => {
    teardown();
    if (shot?.previewUrl) URL.revokeObjectURL(shot.previewUrl);
    setShot(null);
    onClose?.();
  };

  return (
    // Clicks are contained here on purpose. Callers commonly render this modal
    // inside the very "Add Photo" element that opens it, and without this a
    // click on Close would bubble back into that handler and re-open the modal
    // before it could shut — leaving a full-screen overlay swallowing the page.
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Camera size={16} /> Take Photo
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
            aria-label="Close camera"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-[3/4] w-full bg-black">
          {shot ? (
            <img src={shot.previewUrl} alt="Captured preview" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/95 px-6 text-center">
              <AlertTriangle className="text-amber-400" size={30} />
              <p className="text-sm text-gray-100">{friendlyCaptureMessage(error)}</p>
              <button
                type="button"
                onClick={start}
                className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-100"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 px-4 py-4">
          {shot ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RefreshCw size={15} /> Retake
              </button>
              <button
                type="button"
                onClick={handleUse}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                <Check size={15} /> Use Photo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setFacingFront((v) => !v)}
                disabled={busy || !!error}
                className="rounded-xl border border-gray-300 p-2.5 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                title="Switch camera"
              >
                <SwitchCamera size={18} />
              </button>
              <button
                type="button"
                onClick={handleCapture}
                disabled={busy || !!error}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                <Camera size={16} /> Capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

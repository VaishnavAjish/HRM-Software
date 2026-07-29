import { Camera, CameraResultType, CameraSource, CameraDirection } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

// Camera-only photo capture. There is deliberately no gallery/file-picker path
// here — on native we ask Capacitor for CameraSource.Camera, on web we drive
// getUserMedia directly. Both return a File so existing upload code that does
// `payload.photo instanceof File` keeps working unchanged.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DIMENSION = 1280; // longest edge after resize
export const JPEG_QUALITY = 0.82;
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];

export const isNativePlatform = () => Capacitor.isNativePlatform();

export class PhotoCaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PhotoCaptureError";
    this.code = code;
  }
}

export const CAPTURE_ERRORS = {
  CANCELLED: "CANCELLED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NO_CAMERA: "NO_CAMERA",
  HARDWARE_ERROR: "HARDWARE_ERROR",
  INSECURE_CONTEXT: "INSECURE_CONTEXT",
  TOO_LARGE: "TOO_LARGE",
  BAD_TYPE: "BAD_TYPE",
  UNKNOWN: "UNKNOWN",
};

const FRIENDLY = {
  [CAPTURE_ERRORS.CANCELLED]: "Photo capture cancelled.",
  [CAPTURE_ERRORS.PERMISSION_DENIED]:
    "Camera permission is required. Please enable Camera access for this app in your device settings.",
  [CAPTURE_ERRORS.NO_CAMERA]: "No camera was found on this device.",
  [CAPTURE_ERRORS.HARDWARE_ERROR]:
    "The camera could not be started. It may be in use by another app.",
  [CAPTURE_ERRORS.INSECURE_CONTEXT]:
    "Camera access needs a secure (HTTPS) connection.",
  [CAPTURE_ERRORS.TOO_LARGE]: "That photo is too large to upload. Please retake it.",
  [CAPTURE_ERRORS.BAD_TYPE]: "That file is not a supported image.",
  [CAPTURE_ERRORS.UNKNOWN]: "Could not capture the photo. Please try again.",
};

export const friendlyCaptureMessage = (err) =>
  FRIENDLY[err?.code] ?? FRIENDLY[CAPTURE_ERRORS.UNKNOWN];

/** Map a browser getUserMedia DOMException onto our error codes. */
export const mapMediaError = (err) => {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return new PhotoCaptureError(CAPTURE_ERRORS.PERMISSION_DENIED, err.message);
    case "NotFoundError":
    case "OverconstrainedError":
      return new PhotoCaptureError(CAPTURE_ERRORS.NO_CAMERA, err.message);
    case "NotReadableError":
    case "AbortError":
      return new PhotoCaptureError(CAPTURE_ERRORS.HARDWARE_ERROR, err.message);
    default:
      return new PhotoCaptureError(CAPTURE_ERRORS.UNKNOWN, err?.message || "");
  }
};

/** Reject anything that is not an image we are willing to upload. */
export const validateImage = (file) => {
  if (!file || !ACCEPTED_MIME.includes(file.type)) {
    throw new PhotoCaptureError(CAPTURE_ERRORS.BAD_TYPE, `Rejected type: ${file?.type}`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PhotoCaptureError(CAPTURE_ERRORS.TOO_LARGE, `${file.size} bytes`);
  }
  return file;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PhotoCaptureError(CAPTURE_ERRORS.UNKNOWN, "decode failed"));
    img.src = src;
  });

/**
 * Downscale to MAX_DIMENSION on the longest edge and re-encode as JPEG.
 *
 * Drawing through a canvas strips the EXIF block, so orientation must already
 * be baked into the pixels: Capacitor is asked for correctOrientation, and the
 * web path composites from a live <video> frame which is upright by definition.
 */
export const compressImage = async (blob, fileName = "photo.jpg") => {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const { width, height } = img;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const out = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!out) throw new PhotoCaptureError(CAPTURE_ERRORS.UNKNOWN, "encode failed");

    return validateImage(
      new File([out], fileName, { type: "image/jpeg", lastModified: Date.now() }),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

/**
 * Native (Capacitor) capture. `source: CameraSource.Camera` opens the camera
 * directly — it never shows the "Camera or Photos?" prompt, so the gallery is
 * unreachable from this flow. The OS camera app supplies its own
 * capture/retake/confirm screen.
 */
export const captureNativePhoto = async ({ front = true } = {}) => {
  try {
    const perm = await Camera.checkPermissions();
    if (perm.camera !== "granted") {
      const asked = await Camera.requestPermissions({ permissions: ["camera"] });
      if (asked.camera !== "granted") {
        throw new PhotoCaptureError(CAPTURE_ERRORS.PERMISSION_DENIED, "camera not granted");
      }
    }

    const photo = await Camera.getPhoto({
      source: CameraSource.Camera, // camera only — no gallery, no prompt
      direction: front ? CameraDirection.Front : CameraDirection.Rear,
      resultType: CameraResultType.DataUrl,
      correctOrientation: true, // bake EXIF rotation into the pixels
      allowEditing: false,
      saveToGallery: false, // never write to shared storage
      quality: 85,
      width: MAX_DIMENSION,
    });

    if (!photo?.dataUrl) throw new PhotoCaptureError(CAPTURE_ERRORS.UNKNOWN, "empty result");
    return compressImage(await dataUrlToBlob(photo.dataUrl), `photo-${Date.now()}.jpg`);
  } catch (err) {
    if (err instanceof PhotoCaptureError) throw err;
    const msg = String(err?.message || err);
    if (/cancel/i.test(msg)) throw new PhotoCaptureError(CAPTURE_ERRORS.CANCELLED, msg);
    if (/permission|denied/i.test(msg))
      throw new PhotoCaptureError(CAPTURE_ERRORS.PERMISSION_DENIED, msg);
    if (/no camera|unavailable/i.test(msg))
      throw new PhotoCaptureError(CAPTURE_ERRORS.NO_CAMERA, msg);
    throw new PhotoCaptureError(CAPTURE_ERRORS.UNKNOWN, msg);
  }
};

/** Open a webcam stream for the in-browser capture modal. */
export const openWebcamStream = async ({ front = true } = {}) => {
  if (!window.isSecureContext) {
    throw new PhotoCaptureError(CAPTURE_ERRORS.INSECURE_CONTEXT, "requires https");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new PhotoCaptureError(CAPTURE_ERRORS.NO_CAMERA, "getUserMedia unsupported");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: front ? "user" : "environment",
        width: { ideal: MAX_DIMENSION },
        height: { ideal: MAX_DIMENSION },
      },
      audio: false,
    });
  } catch (err) {
    throw mapMediaError(err);
  }
};

export const stopStream = (stream) => {
  stream?.getTracks?.().forEach((track) => track.stop());
};

/** Grab the current <video> frame as a compressed JPEG File. */
export const grabFrame = async (videoEl) => {
  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;
  if (!width || !height) {
    throw new PhotoCaptureError(CAPTURE_ERRORS.HARDWARE_ERROR, "no video frame");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(videoEl, 0, 0, width, height);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new PhotoCaptureError(CAPTURE_ERRORS.UNKNOWN, "encode failed");
  return compressImage(blob, `photo-${Date.now()}.jpg`);
};

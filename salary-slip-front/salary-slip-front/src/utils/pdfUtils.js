import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const PDF_TARGET_WIDTH = 800;
const PDF_MARGIN_X = 5;
const PDF_MARGIN_Y = 6;
const PDF_PAGE_WIDTH = 210 - PDF_MARGIN_X * 2;
const PDF_PAGE_HEIGHT = 297;

function isCanvasBlank(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) return true;

  const { width, height } = canvas;
  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;

      if (a !== 0 && !(r > 250 && g > 250 && b > 250)) {
        return false;
      }
    }
  }

  return true;
}

function prepareCloneForPdf(clone, renderWidth) {
  clone.style.boxShadow = "none";
  clone.style.margin = "0";
  clone.style.maxWidth = "none";
  clone.style.width = `${renderWidth}px`;
  clone.style.minWidth = `${renderWidth}px`;
  clone.style.transform = "none";
  clone.style.background = "#ffffff";
  clone.style.textRendering = "geometricPrecision";

  clone.querySelectorAll("table").forEach((table) => {
    table.style.borderCollapse = "collapse";
    table.style.borderSpacing = "0";
    table.style.background = "#ffffff";
  });

  clone.querySelectorAll("th, td").forEach((cell) => {
    cell.style.backgroundClip = "padding-box";
    cell.style.verticalAlign = cell.style.verticalAlign || "top";
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Converts all <img> srcs in the clone to base64 data URLs so html2canvas
// can render them regardless of CORS restrictions on the original URL.
async function convertImagesToBase64(clone) {
  const imgs = Array.from(clone.querySelectorAll("img"));

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;

      // Try fetch → blob → base64 first (works when server sends CORS headers)
      try {
        const response = await fetch(src, { mode: "cors" });
        if (!response.ok) throw new Error("fetch failed");
        const blob = await response.blob();
        img.src = await blobToDataUrl(blob);
        return;
      } catch {}

      // Fallback: draw to an off-screen canvas (works for same-origin)
      try {
        const offscreen = document.createElement("canvas");
        const ctx = offscreen.getContext("2d");
        const image = new Image();
        image.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = src;
        });
        offscreen.width = image.naturalWidth || 1;
        offscreen.height = image.naturalHeight || 1;
        ctx.drawImage(image, 0, 0);
        img.src = offscreen.toDataURL("image/png");
      } catch {
        // Leave original src; html2canvas will skip it gracefully
      }
    }),
  );
}

async function captureCanvas(clone, captureWidth, captureHeight) {
  const baseOptions = {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    width: captureWidth,
    height: captureHeight,
    windowWidth: captureWidth,
    windowHeight: captureHeight,
    removeContainer: true,
    scrollX: 0,
    scrollY: 0,
  };

  const attempts = [
    {
      ...baseOptions,
      scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1)),
      foreignObjectRendering: false,
    },
    {
      ...baseOptions,
      scale: 2,
      foreignObjectRendering: false,
    },
  ];

  for (const options of attempts) {
    const canvas = await html2canvas(clone, options);

    if (canvas.width > 0 && canvas.height > 0 && !isCanvasBlank(canvas)) {
      return canvas;
    }
  }

  throw new Error("Blank PDF canvas generated");
}

// fitToOnePage: scales the content down to fit entirely on a single A4 page
// when it would otherwise overflow onto a second page.
export async function exportNodeToPdf(
  element,
  filename,
  { fitToOnePage = false } = {},
) {
  let wrapper = null;

  try {
    // Use the element's actual rendered width so nothing gets clipped
    const renderWidth =
      Math.ceil(element.getBoundingClientRect().width) || PDF_TARGET_WIDTH;

    wrapper = document.createElement("div");
    wrapper.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      `width:${renderWidth}px`,
      "background:#ffffff",
      "overflow:visible",
      "pointer-events:none",
      "opacity:0",
      "z-index:-1",
      "padding:0",
      "margin:0",
    ].join(";");

    const clone = element.cloneNode(true);
    prepareCloneForPdf(clone, renderWidth);

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // Wait for layout
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    // Convert images to base64 to fix CORS rendering issues
    await convertImagesToBase64(clone);

    // Then wait for any remaining img loads
    await Promise.all(
      Array.from(clone.querySelectorAll("img")).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) resolve();
            else {
              img.onload = resolve;
              img.onerror = resolve;
            }
          }),
      ),
    );

    const captureWidth = Math.ceil(clone.scrollWidth || renderWidth);
    const captureHeight = Math.ceil(clone.scrollHeight);
    const canvas = await captureCanvas(clone, captureWidth, captureHeight);

    const imgData = canvas.toDataURL("image/png");
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imageHeight = (canvas.height / canvas.width) * PDF_PAGE_WIDTH;
    const usableHeight = PDF_PAGE_HEIGHT - PDF_MARGIN_Y * 2;

    if (fitToOnePage && imageHeight > usableHeight) {
      // Scale both dimensions down proportionally so everything fits on 1 page
      const scale = usableHeight / imageHeight;
      const scaledWidth = PDF_PAGE_WIDTH * scale;
      const xOffset = (210 - scaledWidth) / 2;
      doc.addImage(imgData, "PNG", xOffset, PDF_MARGIN_Y, scaledWidth, usableHeight);
    } else if (imageHeight <= usableHeight) {
      doc.addImage(
        imgData,
        "PNG",
        PDF_MARGIN_X,
        PDF_MARGIN_Y,
        PDF_PAGE_WIDTH,
        imageHeight,
      );
    } else {
      let page = 0;
      let yOffset = 0;

      while (yOffset < imageHeight) {
        if (page > 0) doc.addPage();

        doc.addImage(
          imgData,
          "PNG",
          PDF_MARGIN_X,
          PDF_MARGIN_Y - yOffset,
          PDF_PAGE_WIDTH,
          imageHeight,
        );

        yOffset += usableHeight;
        page += 1;
      }
    }

    doc.save(filename);
  } finally {
    if (wrapper?.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}

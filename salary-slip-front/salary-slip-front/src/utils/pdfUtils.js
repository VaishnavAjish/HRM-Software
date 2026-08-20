let html2canvasPromise;
let jsPdfPromise;

function loadHtml2Canvas() {
  html2canvasPromise ??= import("html2canvas").then((m) => m.default);
  return html2canvasPromise;
}

function loadJsPdf() {
  jsPdfPromise ??= import("jspdf").then((m) => m.default);
  return jsPdfPromise;
}

const PDF_TARGET_WIDTH = 680;

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
  clone.style.paddingBottom = "12px";

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

async function convertImagesToBase64(clone) {
  const imgs = Array.from(clone.querySelectorAll("img"));

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;

      try {
        const response = await fetch(src, { mode: "cors" });
        if (!response.ok) throw new Error("fetch failed");
        const blob = await response.blob();
        img.src = await blobToDataUrl(blob);
        return;
      } catch {
      }

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
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(clone, options);

    if (canvas.width > 0 && canvas.height > 0 && !isCanvasBlank(canvas)) {
      return canvas;
    }
  }

  throw new Error("Blank PDF canvas generated");
}

export async function exportNodeToPdf(
  element,
  filename,
  { fitToOnePage = true, format = "a5", orientation = "portrait" } = {},
) {
  let wrapper = null;

  try {
    const isA5 = format.toLowerCase() === "a5";
    const pdfPageWidth = isA5 ? 148 : 210;
    const pdfPageHeight = isA5 ? 210 : 297;
    const marginX = isA5 ? 4 : 5;
    const marginY = isA5 ? 5 : 6;
    const usableWidth = pdfPageWidth - marginX * 2;
    const usableHeight = pdfPageHeight - marginY * 2;

    const renderWidth =
      Math.ceil(element.getBoundingClientRect().width) || (isA5 ? 680 : PDF_TARGET_WIDTH);

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

    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    await convertImagesToBase64(clone);

    await Promise.all(
      Array.from(clone.querySelectorAll("img")).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve();
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
    const jsPDF = await loadJsPdf();
    const doc = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: format.toLowerCase(),
    });

    const imageHeight = (canvas.height / canvas.width) * usableWidth;

    if (fitToOnePage || imageHeight > usableHeight) {
      const scale = Math.min(1, usableHeight / imageHeight);
      const scaledWidth = usableWidth * scale;
      const scaledHeight = imageHeight * scale;
      const xOffset = marginX + (usableWidth - scaledWidth) / 2;
      doc.addImage(imgData, "PNG", xOffset, marginY, scaledWidth, scaledHeight);
    } else {
      let page = 0;
      let yOffset = 0;

      while (yOffset < imageHeight) {
        if (page > 0) doc.addPage();

        doc.addImage(
          imgData,
          "PNG",
          marginX,
          marginY - yOffset,
          usableWidth,
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

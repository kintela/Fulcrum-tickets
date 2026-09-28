const INITIAL_MAX_DIMENSION = 1800;
const MIN_MAX_DIMENSION = 1000;
const INITIAL_QUALITY = 0.82;
const MIN_QUALITY = 0.52;

type ImageSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function loadImage(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Some browsers cannot decode HEIC/TIFF with createImageBitmap. Try the native image element next.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = document.createElement("img");
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`No se puede comprimir la imagen ${file.name}.`));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se ha podido comprimir una de las imágenes.")), "image/jpeg", quality);
  });
}

async function compressImage(file: File, outputName: string, maxDimension: number, quality: number) {
  const image = await loadImage(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("El navegador no permite procesar las imágenes.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image.source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, quality);
    return new File([blob], outputName, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    image.close();
  }
}

export async function compressImagesToBudget(
  images: Array<{ file: File; outputName: string }>,
  maximumBytes: number,
) {
  let maxDimension = INITIAL_MAX_DIMENSION;
  let quality = INITIAL_QUALITY;
  let compressed: File[] = [];

  for (;;) {
    compressed = [];
    for (const image of images) {
      compressed.push(await compressImage(image.file, image.outputName, maxDimension, quality));
    }

    const totalBytes = compressed.reduce((total, file) => total + file.size, 0);
    if (totalBytes <= maximumBytes) return { files: compressed, totalBytes };

    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.08);
      continue;
    }

    if (maxDimension > MIN_MAX_DIMENSION) {
      maxDimension = Math.max(MIN_MAX_DIMENSION, Math.round(maxDimension * 0.82));
      quality = Math.min(INITIAL_QUALITY, MIN_QUALITY + 0.12);
      continue;
    }

    throw new Error("No es posible reducir las cinco imágenes sin perder demasiada legibilidad. Elimina un ticket o repite alguna foto con menor resolución.");
  }
}

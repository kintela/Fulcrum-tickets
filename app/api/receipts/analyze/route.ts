import { analyzeReceipt, DocumentIntelligenceError } from "@/lib/azure-document-intelligence";
import type { ApiErrorResponse, AnalyzeReceiptResponse } from "@/lib/receipt";

export const maxDuration = 60;

const DEFAULT_MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/tiff",
  "image/heif",
  "image/heic",
]);

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } } satisfies ApiErrorResponse, { status });
}

function maximumFileSize() {
  const configured = Number(process.env.RECEIPT_MAX_FILE_SIZE_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_FILE_SIZE;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse("FILE_REQUIRED", "Selecciona una imagen del ticket.", 400);
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return errorResponse(
        "UNSUPPORTED_FILE_TYPE",
        "El formato no es compatible. Usa JPEG, PNG, BMP, TIFF, HEIF o HEIC.",
        415,
      );
    }

    if (file.size === 0) {
      return errorResponse("EMPTY_FILE", "La imagen seleccionada está vacía.", 400);
    }

    const maxFileSize = maximumFileSize();
    if (file.size > maxFileSize) {
      const maxMb = Math.floor(maxFileSize / (1024 * 1024));
      return errorResponse(
        "FILE_TOO_LARGE",
        `La imagen supera el máximo permitido de ${maxMb} MB.`,
        413,
      );
    }

    const azureContentType = file.type === "image/heic" ? "image/heif" : file.type;
    const receipt = await analyzeReceipt(await file.arrayBuffer(), azureContentType);
    return Response.json({ receipt } satisfies AnalyzeReceiptResponse);
  } catch (error) {
    if (error instanceof DocumentIntelligenceError) {
      return errorResponse(error.code, error.message, error.status);
    }

    console.error("Unexpected receipt analysis error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "No hemos podido analizar el ticket. Inténtalo de nuevo.",
      500,
    );
  }
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { ApiErrorResponse, NotaGastosParaEnviar, TicketParaEnviar } from "@/lib/receipt";

export const maxDuration = 60;
const MAX_TICKETS = 5;
const MAX_IMAGE_BYTES = Math.floor(3.8 * 1024 * 1024);

const TEXT_FIELDS = [
  "idImagen",
  "numeroTicket",
  "comercio",
  "fecha",
] as const satisfies readonly (keyof TicketParaEnviar)[];

const AMOUNT_FIELDS = [
  "baseImponible",
  "importeIva",
  "importeTotal",
] as const satisfies readonly (keyof TicketParaEnviar)[];

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } } satisfies ApiErrorResponse, { status });
}

function isTicket(value: unknown): value is TicketParaEnviar {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return TEXT_FIELDS.every((field) => typeof candidate[field] === "string")
    && AMOUNT_FIELDS.every((field) => candidate[field] === null || (typeof candidate[field] === "number" && Number.isFinite(candidate[field])))
    && Array.isArray(candidate.conceptos)
    && candidate.conceptos.length > 0
    && candidate.conceptos.every((concepto) => {
      if (!concepto || typeof concepto !== "object") return false;
      const item = concepto as Record<string, unknown>;
      return typeof item.descripcion === "string"
        && ["cantidad", "precioUnitario", "importeTotal"].every((field) => item[field] === null || (typeof item[field] === "number" && Number.isFinite(item[field])));
    });
}

function isNote(value: unknown): value is NotaGastosParaEnviar {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.email === "string"
    && typeof candidate.objeto === "string"
    && typeof candidate.localidad === "string"
    && Array.isArray(candidate.tickets)
    && candidate.tickets.length > 0
    && candidate.tickets.length <= MAX_TICKETS
    && candidate.tickets.every(isTicket);
}

function upstreamErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { message?: unknown; error?: { message?: unknown } };
  if (typeof candidate.error?.message === "string") return candidate.error.message;
  return typeof candidate.message === "string" ? candidate.message : null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return errorResponse("AUTH_REQUIRED", "Debes iniciar sesión con tu cuenta corporativa.", 401);
  }
  if (!session.user.email) {
    return errorResponse("AUTH_EMAIL_REQUIRED", "La sesión corporativa no contiene una dirección de correo.", 403);
  }

  const matrixApiUrl = process.env.MATRIX_RECEIPTS_API_URL;

  if (!matrixApiUrl) {
    return errorResponse("MATRIX_API_NOT_CONFIGURED", "La API matriz no está configurada.", 500);
  }

  try {
    const incoming = await request.formData();
    const datos = incoming.get("Datos");
    const imagenes = incoming.getAll("Imagenes").filter((image): image is File => image instanceof File);

    if (!(datos instanceof File) || imagenes.length === 0) {
      return errorResponse("INVALID_MULTIPART", "La petición debe incluir los datos y las imágenes de la nota.", 400);
    }

    let note: unknown;
    try {
      note = JSON.parse(await datos.text());
    } catch {
      return errorResponse("INVALID_NOTE_DATA", "Los datos de la nota no contienen un JSON válido.", 400);
    }

    if (!isNote(note)) {
      return errorResponse("INVALID_NOTE_DATA", "Los campos de la nota o de sus tickets no son válidos.", 400);
    }

    if (imagenes.length !== note.tickets.length || imagenes.length > MAX_TICKETS) {
      return errorResponse("INVALID_IMAGE_COUNT", `La nota debe incluir entre 1 y ${MAX_TICKETS} imágenes, una por ticket.`, 400);
    }

    const imageNames = new Set(imagenes.map((image) => image.name));
    if (!note.tickets.every((ticket) => imageNames.has(ticket.idImagen))) {
      return errorResponse("IMAGE_MISMATCH", "No se ha encontrado la imagen correspondiente a uno de los tickets.", 400);
    }

    if (imagenes.reduce((total, image) => total + image.size, 0) > MAX_IMAGE_BYTES) {
      return errorResponse("IMAGES_TOO_LARGE", "Las imágenes de la nota superan el tamaño máximo permitido.", 413);
    }

    const authenticatedNote: NotaGastosParaEnviar = {
      ...note,
      email: session.user.email,
    };

    const outgoing = new FormData();
    outgoing.append("Datos", new Blob([JSON.stringify(authenticatedNote)], { type: "application/json" }), "datos.json");
    imagenes.forEach((image) => outgoing.append("Imagenes", image, image.name));

    const headers = new Headers();
    const token = process.env.MATRIX_RECEIPTS_API_TOKEN;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const upstream = await fetch(matrixApiUrl, {
      method: "POST",
      headers,
      body: outgoing,
      signal: AbortSignal.timeout(55_000),
    });

    if (!upstream.ok) {
      const contentType = upstream.headers.get("content-type");
      const responseBody = contentType?.includes("application/json")
        ? await upstream.json()
        : null;
      return errorResponse(
        "MATRIX_API_ERROR",
        upstreamErrorMessage(responseBody) ?? "La API matriz ha rechazado la nota de gastos.",
        upstream.status,
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unexpected matrix API error", error);
    return errorResponse("MATRIX_API_UNAVAILABLE", "No hemos podido conectar con la API matriz.", 502);
  }
}

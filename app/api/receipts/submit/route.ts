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

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function upstreamErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const candidate = value as {
    title?: unknown;
    detail?: unknown;
    message?: unknown;
    error?: unknown;
    errors?: unknown;
  };
  const nestedError = candidate.error && typeof candidate.error === "object"
    ? textValue((candidate.error as { message?: unknown }).message)
    : null;
  const validationErrors = candidate.errors && typeof candidate.errors === "object"
    ? Object.values(candidate.errors as Record<string, unknown>)
      .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
      .flatMap((entry) => textValue(entry) ?? [])
    : [];
  const summary = [
    textValue(candidate.detail),
    textValue(candidate.message),
    nestedError,
    textValue(candidate.error),
    ...validationErrors,
  ].filter((entry): entry is string => Boolean(entry));

  if (summary.length > 0) return [...new Set(summary)].join(" ");
  return textValue(candidate.title);
}

function responsePreview(value: string) {
  const limit = 4_000;
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function expenseNotesUrl(value: unknown) {
  const directUrl = safeHttpUrl(value);
  if (directUrl) return directUrl;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  const entries = Object.entries(response);
  const exactUrl = entries.find(([key]) => key.toLowerCase() === "url");
  if (exactUrl) return safeHttpUrl(exactUrl[1]);

  const namedUrl = entries.find(([key, entryValue]) => key.toLowerCase().includes("url") && safeHttpUrl(entryValue));
  return safeHttpUrl(namedUrl?.[1]);
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
      const contentType = upstream.headers.get("content-type") ?? "";
      const responseText = await upstream.text();
      let responseBody: unknown = null;

      if (contentType.includes("application/json") && responseText) {
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = null;
        }
      }

      const apiMessage = upstreamErrorMessage(responseBody)
        ?? (contentType.startsWith("text/plain") ? textValue(responseText) : null);
      console.error("Matrix API rejected expense note", {
        status: upstream.status,
        statusText: upstream.statusText,
        contentType,
        response: responsePreview(responseText),
        request: {
          noteFields: Object.keys(authenticatedNote),
          ticketCount: authenticatedNote.tickets.length,
          ticketFields: Object.keys(authenticatedNote.tickets[0] ?? {}),
          conceptFields: Object.keys(authenticatedNote.tickets[0]?.conceptos[0] ?? {}),
          tickets: authenticatedNote.tickets.map((ticket) => ({
            numeroTicket: ticket.numeroTicket,
            conceptos: ticket.conceptos.map((concepto, index) => ({
              posicion: index + 1,
              ...concepto,
            })),
          })),
          images: imagenes.map((image) => ({ name: image.name, type: image.type, size: image.size })),
        },
      });
      return errorResponse(
        "MATRIX_API_ERROR",
        apiMessage
          ? `La API matriz respondió HTTP ${upstream.status}: ${apiMessage}`
          : `La API matriz ha rechazado la nota de gastos (HTTP ${upstream.status}).`,
        upstream.status,
      );
    }

    const responseText = await upstream.text();
    let responseBody: unknown = responseText;

    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        // Some API implementations return the URL as plain text.
      }
    }

    return Response.json({ ok: true, url: expenseNotesUrl(responseBody) });
  } catch (error) {
    console.error("Unexpected matrix API error", error);
    return errorResponse("MATRIX_API_UNAVAILABLE", "No hemos podido conectar con la API matriz.", 502);
  }
}

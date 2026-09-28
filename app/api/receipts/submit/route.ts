import type { ApiErrorResponse, TicketParaEnviar } from "@/lib/receipt";

export const maxDuration = 60;

const TEXT_FIELDS = [
  "objeto",
  "localidad",
  "numeroTicket",
  "comercio",
  "fecha",
  "concepto",
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
    && AMOUNT_FIELDS.every((field) => candidate[field] === null || (typeof candidate[field] === "number" && Number.isFinite(candidate[field])));
}

function upstreamErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { message?: unknown; error?: { message?: unknown } };
  if (typeof candidate.error?.message === "string") return candidate.error.message;
  return typeof candidate.message === "string" ? candidate.message : null;
}

export async function POST(request: Request) {
  const matrixApiUrl = process.env.MATRIX_RECEIPTS_API_URL;

  if (!matrixApiUrl) {
    return errorResponse("MATRIX_API_NOT_CONFIGURED", "La API matriz no está configurada.", 500);
  }

  try {
    const incoming = await request.formData();
    const datos = incoming.get("Datos");
    const imagen = incoming.get("Imagen");

    if (!(datos instanceof File) || !(imagen instanceof File)) {
      return errorResponse("INVALID_MULTIPART", "La petición debe incluir los datos y la imagen del ticket.", 400);
    }

    let ticket: unknown;
    try {
      ticket = JSON.parse(await datos.text());
    } catch {
      return errorResponse("INVALID_TICKET_DATA", "Los datos del ticket no contienen un JSON válido.", 400);
    }

    if (!isTicket(ticket)) {
      return errorResponse("INVALID_TICKET_DATA", "Los campos del ticket no son válidos.", 400);
    }

    const outgoing = new FormData();
    outgoing.append("Datos", new Blob([JSON.stringify(ticket)], { type: "application/json" }), "datos.json");
    outgoing.append("Imagen", imagen, imagen.name);

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
        upstreamErrorMessage(responseBody) ?? "La API matriz ha rechazado el ticket.",
        upstream.status,
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unexpected matrix API error", error);
    return errorResponse("MATRIX_API_UNAVAILABLE", "No hemos podido conectar con la API matriz.", 502);
  }
}

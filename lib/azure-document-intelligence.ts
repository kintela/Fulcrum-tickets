import "server-only";

import type { Receipt, ReceiptItem } from "@/lib/receipt";

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-receipt";
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 45;

type AzureField = {
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: {
    amount?: number;
    currencyCode?: string;
  };
  valueArray?: AzureField[];
  valueObject?: Record<string, AzureField>;
};

type AzureAnalyzeOperation = {
  status?: "notStarted" | "running" | "succeeded" | "failed" | "canceled";
  error?: { code?: string; message?: string };
  analyzeResult?: {
    content?: string;
    documents?: Array<{ fields?: Record<string, AzureField> }>;
  };
};

export class DocumentIntelligenceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DocumentIntelligenceError";
  }
}

function asString(field: AzureField | undefined): string | null {
  const value = field?.valueString ?? field?.valueDate ?? field?.content;
  return value?.trim() || null;
}

function asNumber(field: AzureField | undefined): number | null {
  const value = field?.valueCurrency?.amount ?? field?.valueNumber;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function confidence(field: AzureField | undefined): number | null {
  return typeof field?.confidence === "number" ? field.confidence : null;
}

function sumFields(fields: Array<AzureField | undefined>): number | null {
  const values = fields
    .map(asNumber)
    .filter((value): value is number => value !== null);

  return values.length > 0
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function lowestConfidence(fields: Array<AzureField | undefined>): number | null {
  const values = fields
    .map(confidence)
    .filter((value): value is number => value !== null);

  return values.length > 0 ? Math.min(...values) : null;
}

function extractReceiptNumber(
  fields: Record<string, AzureField>,
  content: string | undefined,
): { value: string | null; confidence: number | null } {
  const structuredField =
    fields.ReceiptNumber ??
    fields.TicketNumber ??
    fields.InvoiceId ??
    fields.TransactionId;
  const structuredValue = asString(structuredField);

  if (structuredValue) {
    return { value: structuredValue, confidence: confidence(structuredField) };
  }

  const lines = content?.split(/\r?\n/).map((line) => line.trim()) ?? [];
  const documentLabel = String.raw`(?:fra\.?\s*sim(?:plificada)?|factura\s+simplificada|ticket|recibo|receipt)`;
  const numberMarker = String.raw`(?:n(?:[º°o0g]|[úu]m(?:ero)?|ro)?\.?|number)`;
  const operationLabel = String.raw`${numberMarker}\s*(?:op(?:eraci[oó]n)?\.?)?`;
  const identifier = String.raw`([A-Z0-9][A-Z0-9./-]{2,})`;
  const sameLinePatterns = [
    new RegExp(`^${documentLabel}(?:\\s+${numberMarker})?\\s*[:#-]?\\s*${identifier}$`, "i"),
    new RegExp(`^${numberMarker}\\s+${documentLabel}\\s*[:#-]?\\s*${identifier}$`, "i"),
    new RegExp(`^${operationLabel}\\s*[:#-]?\\s*${identifier}$`, "i"),
  ];
  const labelOnlyPatterns = [
    new RegExp(`^${documentLabel}(?:\\s+${numberMarker})?\\s*[:#-]?$`, "i"),
    new RegExp(`^${numberMarker}\\s+${documentLabel}\\s*[:#-]?$`, "i"),
    new RegExp(`^${operationLabel}\\s*[:#-]?$`, "i"),
  ];
  const identifierPattern = new RegExp(`^${identifier}$`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of sameLinePatterns) {
      const match = lines[index].match(pattern);
      if (match) return { value: match[1], confidence: null };
    }

    if (labelOnlyPatterns.some((pattern) => pattern.test(lines[index]))) {
      const nextLineMatch = lines[index + 1]?.match(identifierPattern);
      if (nextLineMatch) return { value: nextLineMatch[1], confidence: null };
    }
  }

  return { value: null, confidence: null };
}

function normalizeItem(field: AzureField): ReceiptItem {
  const item = field.valueObject ?? {};

  return {
    description: asString(item.Description),
    quantity: asNumber(item.Quantity),
    unitPrice: asNumber(item.Price),
    totalPrice: asNumber(item.TotalPrice),
  };
}

export function normalizeAzureReceipt(operation: AzureAnalyzeOperation): Receipt {
  const fields = operation.analyzeResult?.documents?.[0]?.fields;

  if (!fields) {
    throw new DocumentIntelligenceError(
      "Azure no ha detectado un ticket en la imagen.",
      "RECEIPT_NOT_DETECTED",
      422,
    );
  }

  const items = (fields.Items?.valueArray ?? []).map(normalizeItem);
  const receiptNumber = extractReceiptNumber(
    fields,
    operation.analyzeResult?.content,
  );
  const taxDetails = (fields.TaxDetails?.valueArray ?? []).map(
    (field) => field.valueObject ?? {},
  );
  const netAmountFields = taxDetails.map((detail) => detail.NetAmount);
  const taxAmountFields = taxDetails.map((detail) => detail.Amount);
  const subtotal = asNumber(fields.Subtotal) ?? sumFields(netAmountFields);
  const totalTax = asNumber(fields.TotalTax) ?? sumFields(taxAmountFields);
  const currency =
    fields.Total?.valueCurrency?.currencyCode ??
    fields.Subtotal?.valueCurrency?.currencyCode ??
    fields.TotalTax?.valueCurrency?.currencyCode ??
    netAmountFields.find((field) => field?.valueCurrency?.currencyCode)
      ?.valueCurrency?.currencyCode ??
    taxAmountFields.find((field) => field?.valueCurrency?.currencyCode)
      ?.valueCurrency?.currencyCode ??
    null;

  return {
    receiptNumber: receiptNumber.value,
    merchantName: asString(fields.MerchantName),
    transactionDate: asString(fields.TransactionDate),
    subtotal,
    totalTax,
    total: asNumber(fields.Total),
    currency,
    receiptType: asString(fields.ReceiptType),
    items,
    confidence: {
      receiptNumber: receiptNumber.confidence,
      merchantName: confidence(fields.MerchantName),
      transactionDate: confidence(fields.TransactionDate),
      subtotal: confidence(fields.Subtotal) ?? lowestConfidence(netAmountFields),
      totalTax: confidence(fields.TotalTax) ?? lowestConfidence(taxAmountFields),
      total: confidence(fields.Total),
    },
  };
}

function getConfiguration() {
  const endpointValue = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpointValue || !key) {
    throw new DocumentIntelligenceError(
      "Azure Document Intelligence no está configurado en el servidor.",
      "AZURE_NOT_CONFIGURED",
      503,
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new DocumentIntelligenceError(
      "El endpoint de Azure Document Intelligence no es válido.",
      "AZURE_INVALID_CONFIGURATION",
      500,
    );
  }

  if (endpoint.protocol !== "https:") {
    throw new DocumentIntelligenceError(
      "El endpoint de Azure Document Intelligence debe usar HTTPS.",
      "AZURE_INVALID_CONFIGURATION",
      500,
    );
  }

  return { endpoint: endpoint.origin, key };
}

async function readAzureError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    return body.error?.message ?? `Azure respondió con HTTP ${response.status}.`;
  } catch {
    return `Azure respondió con HTTP ${response.status}.`;
  }
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function analyzeReceipt(
  bytes: ArrayBuffer,
  contentType: string,
): Promise<Receipt> {
  const { endpoint, key } = getConfiguration();
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}`;
  const headers = {
    "Content-Type": contentType,
    "Ocp-Apim-Subscription-Key": key,
  };

  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers,
    body: bytes,
    cache: "no-store",
  });

  if (!analyzeResponse.ok) {
    throw new DocumentIntelligenceError(
      await readAzureError(analyzeResponse),
      "AZURE_ANALYZE_REJECTED",
      502,
    );
  }

  const operationLocation = analyzeResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new DocumentIntelligenceError(
      "Azure no ha devuelto la ubicación del análisis.",
      "AZURE_INVALID_RESPONSE",
      502,
    );
  }

  const operationUrl = new URL(operationLocation);
  if (operationUrl.protocol !== "https:" || operationUrl.origin !== endpoint) {
    throw new DocumentIntelligenceError(
      "Azure ha devuelto una ubicación de análisis no válida.",
      "AZURE_INVALID_RESPONSE",
      502,
    );
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_INTERVAL_MS);

    const resultResponse = await fetch(operationUrl, {
      headers: { "Ocp-Apim-Subscription-Key": key },
      cache: "no-store",
    });

    if (!resultResponse.ok) {
      throw new DocumentIntelligenceError(
        await readAzureError(resultResponse),
        "AZURE_RESULT_REJECTED",
        502,
      );
    }

    const operation = (await resultResponse.json()) as AzureAnalyzeOperation;
    if (operation.status === "succeeded") return normalizeAzureReceipt(operation);

    if (operation.status === "failed" || operation.status === "canceled") {
      throw new DocumentIntelligenceError(
        operation.error?.message ?? "Azure no ha podido analizar el ticket.",
        operation.error?.code ?? "AZURE_ANALYSIS_FAILED",
        422,
      );
    }
  }

  throw new DocumentIntelligenceError(
    "El análisis está tardando demasiado. Inténtalo de nuevo.",
    "AZURE_ANALYSIS_TIMEOUT",
    504,
  );
}

export type ReceiptItem = {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
};

export type ReceiptConfidence = {
  receiptNumber: number | null;
  merchantName: number | null;
  transactionDate: number | null;
  subtotal: number | null;
  totalTax: number | null;
  total: number | null;
};

export type Receipt = {
  receiptNumber: string | null;
  merchantName: string | null;
  transactionDate: string | null;
  subtotal: number | null;
  totalTax: number | null;
  total: number | null;
  currency: string | null;
  receiptType: string | null;
  items: ReceiptItem[];
  confidence: ReceiptConfidence;
};

export type ArticuloTicket = {
  descripcion: string | null;
  cantidad: number | null;
  precioUnitario: number | null;
  importeTotal: number | null;
};

export type ConfianzaTicket = {
  numeroTicket: number | null;
  comercio: number | null;
  fecha: number | null;
  baseImponible: number | null;
  importeIva: number | null;
  importeTotal: number | null;
};

export type TicketAnalizado = {
  numeroTicket: string | null;
  comercio: string | null;
  fecha: string | null;
  baseImponible: number | null;
  importeIva: number | null;
  importeTotal: number | null;
  tipoTicket: string | null;
  articulos: ArticuloTicket[];
  confianza: ConfianzaTicket;
};

export type AnalyzeReceiptResponse = {
  ticket: TicketAnalizado;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

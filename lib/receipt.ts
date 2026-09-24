export type ReceiptItem = {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
};

export type ReceiptConfidence = {
  merchantName: number | null;
  transactionDate: number | null;
  subtotal: number | null;
  totalTax: number | null;
  total: number | null;
};

export type Receipt = {
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

export type AnalyzeReceiptResponse = {
  receipt: Receipt;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

"use client";

import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { AnalyzeReceiptResponse, ApiErrorResponse, Receipt } from "@/lib/receipt";

type Step = "capture" | "preview" | "processing" | "review" | "success";
type ReceiptData = { merchant: string; date: string; detail: string; subtotal: string; tax: string; total: string };

const initialReceipt: ReceiptData = {
  merchant: "", date: "", detail: "", subtotal: "", tax: "", total: "",
};

function formatAmount(value: number | null) {
  return value === null ? "" : new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function receiptToForm(receipt: Receipt): ReceiptData {
  const descriptions = receipt.items.flatMap((item) => item.description ? [item.description] : []);
  return {
    merchant: receipt.merchantName ?? "",
    date: formatDate(receipt.transactionDate),
    detail: descriptions.slice(0, 3).join(", ") || receipt.receiptType || "",
    subtotal: formatAmount(receipt.subtotal),
    tax: formatAmount(receipt.totalTax),
    total: formatAmount(receipt.total),
  };
}

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>{children}</svg>;
}
const CameraIcon = ({ size = 24 }: { size?: number }) => <Icon size={size}><path d="M8.6 5.2 10 3h4l1.4 2.2H19A2 2 0 0 1 21 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-1.8h3.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.8"/></Icon>;
const ImageIcon = () => <Icon size={20}><rect height="16" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="4"/><path d="m4 17 5-5 3 3 2-2 6 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="16.5" cy="8.5" fill="currentColor" r="1.5"/></Icon>;
const CheckIcon = ({ size = 24 }: { size?: number }) => <Icon size={size}><path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2"/></Icon>;
const ArrowIcon = () => <Icon size={20}><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></Icon>;
const CloseIcon = () => <Icon size={20}><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></Icon>;

function ReceiptArtwork() {
  return <div className="receipt-art" aria-hidden="true"><div className="receipt-paper">
    <div className="receipt-mark">LP</div><span className="receipt-name">LA PLAZA</span><span className="receipt-subline">RESTAURANTE</span>
    <div className="receipt-rule"/><div className="receipt-row"><span>MENÚ DEL DÍA</span><span>22,00</span></div><div className="receipt-row"><span>MENÚ DEL DÍA</span><span>22,00</span></div><div className="receipt-row"><span>CAFÉ</span><span>5,50</span></div>
    <div className="receipt-rule"/><div className="receipt-total"><span>TOTAL</span><strong>49,50 €</strong></div><span className="receipt-thanks">¡GRACIAS POR SU VISITA!</span>
  </div></div>;
}

export default function TicketScanner() {
  const [step, setStep] = useState<Step>("capture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [data, setData] = useState(initialReceipt);
  const [error, setError] = useState<string | null>(null);
  const [merchantConfidence, setMerchantConfidence] = useState<number | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  function handleImage(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (imageUrl) URL.revokeObjectURL(imageUrl); setSelectedFile(file); setImageUrl(URL.createObjectURL(file)); setError(null); setStep("preview"); event.target.value = ""; }
  function discardImage() { if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(null); setSelectedFile(null); setError(null); setStep("capture"); }
  async function analyze() {
    if (!selectedFile) return;
    setError(null);
    setStep("processing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch("/api/receipts/analyze", { method: "POST", body: formData });
      const body = await response.json() as AnalyzeReceiptResponse | ApiErrorResponse;

      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "No hemos podido analizar el ticket.");
      }

      setData(receiptToForm(body.receipt));
      setMerchantConfidence(body.receipt.confidence.merchantName);
      setStep("review");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "No hemos podido analizar el ticket.");
      setStep("preview");
    }
  }
  function updateField(field: keyof ReceiptData, value: string) { setData((current) => ({ ...current, [field]: value })); }
  function startAgain() { discardImage(); setData(initialReceipt); setMerchantConfidence(null); }

  return <main className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <section className="phone-frame">
      <header className="topbar"><div className="brand" aria-label="Fulcrum Notas de Gastos"><span className="brand-symbol"><span>F</span></span><span className="brand-copy"><strong>fulcrum</strong><small>notas de gastos</small></span></div><span className="secure-badge"><span className="secure-dot"/> Sesión segura</span></header>
      {step === "capture" && <div className="screen capture-screen">
        <div className="intro-copy"><span className="eyebrow">Nuevo justificante</span><h1>Fotografía tu ticket</h1><p>Lo leeremos por ti para que solo tengas que revisar y confirmar.</p></div>
        <button className="capture-zone" onClick={() => cameraInput.current?.click()} type="button"><span className="focus-corner corner-tl"/><span className="focus-corner corner-tr"/><span className="focus-corner corner-bl"/><span className="focus-corner corner-br"/><span className="camera-orb"><CameraIcon size={34}/></span><strong>Hacer una foto</strong><span>Coloca el ticket sobre una superficie plana</span></button>
        <button className="secondary-button" onClick={() => galleryInput.current?.click()} type="button"><ImageIcon/> Elegir de la galería</button>
        <div className="tip-card"><span className="tip-bulb">✦</span><p><strong>Para un mejor resultado</strong><br/>Evita reflejos y asegúrate de que se vea el ticket completo.</p></div>
      </div>}
      {(step === "preview" || step === "processing") && <div className="screen preview-screen">
        <div className="step-heading"><span className="eyebrow">Paso 1 de 2</span><h1>Revisa la imagen</h1><p>Comprueba que los datos se leen con claridad.</p></div>
        <div className="image-preview">{imageUrl ? <Image alt="Ticket seleccionado" fill src={imageUrl} unoptimized/> : <ReceiptArtwork/>}{step === "processing" && <div className="processing-overlay"><span className="scan-line"/><span className="loader"/><strong>Estamos leyendo tu ticket</strong><small>Identificando fecha, concepto e importes…</small></div>}</div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="preview-actions"><button className="text-button" disabled={step === "processing"} onClick={discardImage} type="button"><CloseIcon/> Repetir foto</button><button className="primary-button" disabled={step === "processing"} onClick={analyze} type="button">Analizar ticket <ArrowIcon/></button></div>
      </div>}
      {step === "review" && <div className="screen review-screen">
        <div className="review-top"><div className="mini-preview">{imageUrl ? <Image alt="Ticket" fill src={imageUrl} unoptimized/> : <ReceiptArtwork/>}</div><div><span className="success-label"><CheckIcon size={15}/> Lectura completada</span><h1>Revisa los datos</h1><p>Edita cualquier campo antes de confirmar.</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); setStep("success"); }}>
          <label className="field"><span>Comercio</span><input onChange={(event) => updateField("merchant", event.target.value)} value={data.merchant}/>{merchantConfidence !== null && <small><CheckIcon size={13}/> Confianza {merchantConfidence >= .8 ? "alta" : merchantConfidence >= .5 ? "media" : "baja"}</small>}</label>
          <label className="field"><span>Fecha</span><input inputMode="numeric" onChange={(event) => updateField("date", event.target.value)} value={data.date}/></label>
          <label className="field"><span>Concepto</span><input onChange={(event) => updateField("detail", event.target.value)} value={data.detail}/></label>
          <div className="amount-card"><label><span>Base imponible</span><div><input inputMode="decimal" onChange={(event) => updateField("subtotal", event.target.value)} value={data.subtotal}/><b>€</b></div></label><label><span>IVA</span><div><input inputMode="decimal" onChange={(event) => updateField("tax", event.target.value)} value={data.tax}/><b>€</b></div></label><div className="total-row"><span>Total</span><div><input aria-label="Total" inputMode="decimal" onChange={(event) => updateField("total", event.target.value)} value={data.total}/><b>€</b></div></div></div>
          <button className="primary-button confirm-button" type="submit">Confirmar y añadir <ArrowIcon/></button>
        </form>
      </div>}
      {step === "success" && <div className="screen success-screen">
        <div className="success-check"><CheckIcon size={40}/></div><span className="eyebrow">Justificante añadido</span><h1>¡Todo listo!</h1><p>Los datos del ticket se han preparado para incorporarlos a tu nota de gastos.</p>
        <div className="summary-card"><div><span>Comercio</span><strong>{data.merchant}</strong></div><div><span>Concepto</span><strong>{data.detail}</strong></div><div><span>Fecha</span><strong>{data.date}</strong></div><div className="summary-total"><span>Total</span><strong>{data.total} €</strong></div></div>
        <button className="primary-button full-button" onClick={startAgain} type="button">Escanear otro ticket <CameraIcon size={20}/></button><button className="text-link" type="button">Volver a la nota de gastos</button>
      </div>}
      <footer><span className="lock-icon">⌾</span> Tus datos se procesan de forma segura</footer>
      <input accept="image/jpeg,image/png,image/bmp,image/tiff,image/heif,image/heic" capture="environment" className="sr-only" onChange={handleImage} ref={cameraInput} type="file"/><input accept="image/jpeg,image/png,image/bmp,image/tiff,image/heif,image/heic" className="sr-only" onChange={handleImage} ref={galleryInput} type="file"/>
    </section>
  </main>;
}

"use client";

import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { compressImagesToBudget } from "@/lib/client-image-compression";
import type { AnalyzeReceiptResponse, ApiErrorResponse, ConceptoTicketParaEnviar, NotaGastosParaEnviar, SubmitReceiptResponse, TicketAnalizado, TicketParaEnviar } from "@/lib/receipt";
import LogoutButton from "./logout-button";

const MAX_TICKETS = 5;
const MAX_BATCH_IMAGE_BYTES = Math.floor(3.8 * 1024 * 1024);

type Step = "capture" | "preview" | "processing" | "review" | "note" | "success";
type ReceiptConcept = Omit<ConceptoTicketParaEnviar, "cantidad" | "precioUnitario" | "importeTotal"> & {
  cantidad: string;
  precioUnitario: string;
  importeTotal: string;
};
type ReceiptData = Omit<TicketParaEnviar, "idImagen" | "conceptos" | "baseImponible" | "importeIva" | "importeTotal"> & {
  conceptos: ReceiptConcept[];
  baseImponible: string;
  importeIva: string;
  importeTotal: string;
};
type NoteData = { objeto: string; localidad: string };
type DraftTicket = { id: string; data: ReceiptData; file: File; previewUrl: string };

const initialReceipt: ReceiptData = {
  numeroTicket: "", comercio: "", fecha: "", conceptos: [], baseImponible: "", importeIva: "", importeTotal: "",
};

function formatAmount(value: number | null) {
  return value === null ? "" : new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function receiptToForm(ticket: TicketAnalizado): ReceiptData {
  const conceptos = ticket.articulos.map((item) => ({
    descripcion: item.descripcion ?? "",
    cantidad: formatAmount(item.cantidad),
    precioUnitario: formatAmount(item.precioUnitario),
    importeTotal: formatAmount(item.importeTotal),
  }));
  return {
    numeroTicket: ticket.numeroTicket ?? "",
    comercio: ticket.comercio ?? "",
    fecha: formatDate(ticket.fecha),
    conceptos: conceptos.length > 0 ? conceptos : [{
      descripcion: ticket.tipoTicket ?? "",
      cantidad: "",
      precioUnitario: "",
      importeTotal: "",
    }],
    baseImponible: formatAmount(ticket.baseImponible),
    importeIva: formatAmount(ticket.importeIva),
    importeTotal: formatAmount(ticket.importeTotal),
  };
}

function parseAmount(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error(`El campo ${fieldName} no contiene un importe válido.`);
  return amount;
}

function dateToApiFormat(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value.trim();
}

function imageName(ticketId: string) {
  return `${ticketId}.jpg`;
}

function formToTicketPayload(data: ReceiptData, ticketId: string): TicketParaEnviar {
  return {
    ...data,
    idImagen: imageName(ticketId),
    fecha: dateToApiFormat(data.fecha),
    conceptos: data.conceptos.map((concepto, index) => {
      const descripcion = concepto.descripcion.trim();
      if (!descripcion) {
        const ticket = data.numeroTicket.trim() || "sin número";
        throw new Error(`El concepto ${index + 1} del ticket ${ticket} está vacío.`);
      }
      return {
        descripcion,
        cantidad: parseAmount(concepto.cantidad, `cantidad del concepto ${index + 1}`),
        precioUnitario: parseAmount(concepto.precioUnitario, `precio unitario del concepto ${index + 1}`),
        importeTotal: parseAmount(concepto.importeTotal, `importe del concepto ${index + 1}`),
      };
    }),
    baseImponible: parseAmount(data.baseImponible, "base imponible"),
    importeIva: parseAmount(data.importeIva, "IVA"),
    importeTotal: parseAmount(data.importeTotal, "importe total"),
  };
}

function buildNotePayload(email: string, note: NoteData, tickets: Array<{ id: string; data: ReceiptData }>): NotaGastosParaEnviar {
  return {
    email,
    objeto: note.objeto.trim(),
    localidad: note.localidad.trim(),
    tickets: tickets.map((ticket) => formToTicketPayload(ticket.data, ticket.id)),
  };
}

function ticketTotal(data: ReceiptData) {
  try {
    return parseAmount(data.importeTotal, "importe total") ?? 0;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number) {
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
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

export default function TicketScanner({ userEmail, userName }: { userEmail: string; userName: string }) {
  const [step, setStep] = useState<Step>("capture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [data, setData] = useState(initialReceipt);
  const [noteData, setNoteData] = useState<NoteData>({ objeto: "", localidad: "" });
  const [draftTickets, setDraftTickets] = useState<DraftTicket[]>([]);
  const [submittedNote, setSubmittedNote] = useState<NotaGastosParaEnviar | null>(null);
  const [expenseNotesUrl, setExpenseNotesUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [merchantConfidence, setMerchantConfidence] = useState<number | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const draftTicketsRef = useRef<DraftTicket[]>([]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => { draftTicketsRef.current = draftTickets; }, [draftTickets]);
  useEffect(() => () => { draftTicketsRef.current.forEach((ticket) => URL.revokeObjectURL(ticket.previewUrl)); }, []);
  function clearCurrentTicket() {
    setImageUrl(null);
    setSelectedFile(null);
    setSelectedTicketId(null);
    setData(initialReceipt);
    setMerchantConfidence(null);
  }
  function handleImage(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setSelectedFile(file); setSelectedTicketId(crypto.randomUUID()); setImageUrl(URL.createObjectURL(file)); setError(null); setStep("preview"); event.target.value = ""; }
  function discardImage() { clearCurrentTicket(); setError(null); setStep("capture"); }
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

      setData(receiptToForm(body.ticket));
      setMerchantConfidence(body.ticket.confianza.comercio);
      setStep("review");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "No hemos podido analizar el ticket.");
      setStep("preview");
    }
  }
  function addTicketToNote() {
    if (!selectedFile || !selectedTicketId) {
      setError("No hay ninguna imagen asociada al ticket.");
      return;
    }
    if (!noteData.objeto.trim() || !noteData.localidad.trim()) {
      setError("Indica el objeto y la localidad de la nota de gastos.");
      return;
    }
    if (draftTickets.length >= MAX_TICKETS) {
      setError(`Cada nota puede contener un máximo de ${MAX_TICKETS} tickets.`);
      return;
    }

    try {
      formToTicketPayload(data, selectedTicketId);
      const draft: DraftTicket = {
        id: selectedTicketId,
        data,
        file: selectedFile,
        previewUrl: URL.createObjectURL(selectedFile),
      };
      setDraftTickets((current) => [...current, draft]);
      clearCurrentTicket();
      setError(null);
      setStep("note");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Los datos del ticket no son válidos.");
    }
  }
  function editDraft(ticketId: string) {
    const ticket = draftTickets.find((draft) => draft.id === ticketId);
    if (!ticket) return;
    URL.revokeObjectURL(ticket.previewUrl);
    setDraftTickets((current) => current.filter((draft) => draft.id !== ticketId));
    setSelectedTicketId(ticket.id);
    setSelectedFile(ticket.file);
    setImageUrl(URL.createObjectURL(ticket.file));
    setData(ticket.data);
    setMerchantConfidence(null);
    setError(null);
    setStep("review");
  }
  function removeDraft(ticketId: string) {
    setDraftTickets((current) => {
      const ticket = current.find((draft) => draft.id === ticketId);
      if (ticket) URL.revokeObjectURL(ticket.previewUrl);
      return current.filter((draft) => draft.id !== ticketId);
    });
  }
  function scanAnotherTicket() {
    if (draftTickets.length >= MAX_TICKETS) return;
    clearCurrentTicket();
    setError(null);
    setStep("capture");
  }
  async function submitNote() {
    if (draftTickets.length === 0) {
      setError("Añade al menos un ticket antes de enviar la nota.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setSubmissionStatus("Optimizando las imágenes…");

    try {
      const payload = buildNotePayload(userEmail, noteData, draftTickets.map(({ id, data: ticketData }) => ({ id, data: ticketData })));
      const compressed = await compressImagesToBudget(
        draftTickets.map((ticket) => ({ file: ticket.file, outputName: imageName(ticket.id) })),
        MAX_BATCH_IMAGE_BYTES,
      );
      setSubmissionStatus(`Enviando ${draftTickets.length} ${draftTickets.length === 1 ? "ticket" : "tickets"} (${formatBytes(compressed.totalBytes)})…`);
      const formData = new FormData();
      formData.append("Datos", new Blob([JSON.stringify(payload)], { type: "application/json" }), "datos.json");
      compressed.files.forEach((file) => formData.append("Imagenes", file, file.name));

      if (process.env.NODE_ENV === "development") {
        console.info("Enviando nota a /api/receipts/submit", {
          datos: payload,
          imagenes: compressed.files.map((file) => ({
            nombre: file.name,
            tipo: file.type,
            bytes: file.size,
          })),
        });
      }

      const response = await fetch("/api/receipts/submit", { method: "POST", body: formData });
      const body = await response.json() as SubmitReceiptResponse | ApiErrorResponse;

      if (!response.ok || "error" in body) {
        console.error("La API ha rechazado la nota", {
          httpStatus: response.status,
          httpStatusText: response.statusText,
          respuesta: body,
          datosEnviados: payload,
        });
        throw new Error("error" in body ? body.error.message : "No hemos podido guardar la nota de gastos.");
      }

      setSubmittedNote(payload);
      setExpenseNotesUrl(body.url);
      setStep("success");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "No hemos podido guardar la nota de gastos.");
    } finally {
      setIsSubmitting(false);
      setSubmissionStatus(null);
    }
  }
  function updateField(field: Exclude<keyof ReceiptData, "conceptos">, value: string) { setData((current) => ({ ...current, [field]: value })); }
  function updateNoteField(field: keyof NoteData, value: string) { setNoteData((current) => ({ ...current, [field]: value })); }
  function updateConcept(index: number, field: keyof ReceiptConcept, value: string) {
    setData((current) => ({
      ...current,
      conceptos: current.conceptos.map((concepto, conceptIndex) => conceptIndex === index ? { ...concepto, [field]: value } : concepto),
    }));
  }
  function startAgain() {
    draftTickets.forEach((ticket) => URL.revokeObjectURL(ticket.previewUrl));
    setDraftTickets([]);
    setNoteData({ objeto: "", localidad: "" });
    setSubmittedNote(null);
    setExpenseNotesUrl(null);
    clearCurrentTicket();
    setError(null);
    setStep("capture");
  }

  return <main className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <section className="phone-frame">
      <header className="topbar"><div className="brand" aria-label="Fulcrum Notas de Gastos"><span className="brand-symbol"><span>F</span></span><span className="brand-copy"><strong>fulcrum</strong><small>notas de gastos</small></span></div><div className="session-actions"><span className="session-user" title={userName}>{userName}</span><LogoutButton/></div></header>
      {step === "capture" && <div className="screen capture-screen">
        {draftTickets.length > 0 && <button className="note-progress" onClick={() => setStep("note")} type="button"><span><strong>{draftTickets.length}/{MAX_TICKETS} tickets</strong><small>Nota en preparación</small></span><b>{formatAmount(draftTickets.reduce((total, ticket) => total + ticketTotal(ticket.data), 0))} €</b></button>}
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
        <form onSubmit={(event) => { event.preventDefault(); addTicketToNote(); }}>
          <div className="note-fields"><span>Datos comunes de la nota</span><label className="field"><span>Objeto</span><input name="objeto" onChange={(event) => updateNoteField("objeto", event.target.value)} placeholder="Ej. Viaje comercial" required value={noteData.objeto}/></label><label className="field"><span>Localidad</span><input autoComplete="address-level2" name="localidad" onChange={(event) => updateNoteField("localidad", event.target.value)} placeholder="Ej. Madrid" required value={noteData.localidad}/></label></div>
          <label className="field"><span>Comercio</span><input onChange={(event) => updateField("comercio", event.target.value)} value={data.comercio}/>{merchantConfidence !== null && <small><CheckIcon size={13}/> Confianza {merchantConfidence >= .8 ? "alta" : merchantConfidence >= .5 ? "media" : "baja"}</small>}</label>
          <label className="field"><span>Fecha</span><input inputMode="numeric" onChange={(event) => updateField("fecha", event.target.value)} value={data.fecha}/></label>
          <label className="field"><span>Nº de ticket</span><input onChange={(event) => updateField("numeroTicket", event.target.value)} value={data.numeroTicket}/></label>
          <section className="concepts-card"><div className="concepts-heading"><span>Conceptos</span><small>{data.conceptos.length} {data.conceptos.length === 1 ? "detectado" : "detectados"}</small></div>{data.conceptos.map((concepto, index) => <div className="concept-item" key={index}><label className="field"><span>Concepto {index + 1}</span><input onChange={(event) => updateConcept(index, "descripcion", event.target.value)} value={concepto.descripcion}/></label><div className="concept-values"><label><span>Cantidad</span><input inputMode="decimal" onChange={(event) => updateConcept(index, "cantidad", event.target.value)} value={concepto.cantidad}/></label><label><span>Precio unitario</span><div><input inputMode="decimal" onChange={(event) => updateConcept(index, "precioUnitario", event.target.value)} value={concepto.precioUnitario}/><b>€</b></div></label><label><span>Importe</span><div><input inputMode="decimal" onChange={(event) => updateConcept(index, "importeTotal", event.target.value)} value={concepto.importeTotal}/><b>€</b></div></label></div></div>)}</section>
          <div className="amount-card"><label><span>Base imponible</span><div><input inputMode="decimal" onChange={(event) => updateField("baseImponible", event.target.value)} value={data.baseImponible}/><b>€</b></div></label><label><span>IVA</span><div><input inputMode="decimal" onChange={(event) => updateField("importeIva", event.target.value)} value={data.importeIva}/><b>€</b></div></label><div className="total-row"><span>Total</span><div><input aria-label="Total" inputMode="decimal" onChange={(event) => updateField("importeTotal", event.target.value)} value={data.importeTotal}/><b>€</b></div></div></div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button confirm-button" disabled={!noteData.objeto.trim() || !noteData.localidad.trim()} type="submit">Añadir ticket a la nota <ArrowIcon/></button>
        </form>
      </div>}
      {step === "note" && <div className="screen note-screen">
        <div className="step-heading"><span className="eyebrow">Nota en preparación</span><h1>{draftTickets.length} {draftTickets.length === 1 ? "ticket añadido" : "tickets añadidos"}</h1><p>Revisa los justificantes o añade otro antes de enviar la nota completa.</p></div>
        <div className="note-common-summary"><div><span>Objeto</span><strong>{noteData.objeto}</strong></div><div><span>Localidad</span><strong>{noteData.localidad}</strong></div></div>
        <div className="ticket-list">{draftTickets.map((ticket, index) => <article className="ticket-card" key={ticket.id}><div className="ticket-thumbnail"><Image alt={`Ticket ${index + 1}`} fill src={ticket.previewUrl} unoptimized/></div><div className="ticket-card-copy"><small>Ticket {index + 1}</small><strong>{ticket.data.comercio || "Sin comercio"}</strong><span>{ticket.data.conceptos.length} {ticket.data.conceptos.length === 1 ? "concepto" : "conceptos"} · {formatAmount(ticketTotal(ticket.data))} €</span></div><div className="ticket-card-actions"><button onClick={() => editDraft(ticket.id)} type="button">Editar</button><button className="danger-link" onClick={() => removeDraft(ticket.id)} type="button">Eliminar</button></div></article>)}</div>
        <div className="note-totals"><span>Total de la nota</span><strong>{formatAmount(draftTickets.reduce((total, ticket) => total + ticketTotal(ticket.data), 0))} €</strong><small>{draftTickets.length}/{MAX_TICKETS} tickets · {formatBytes(draftTickets.reduce((total, ticket) => total + ticket.file.size, 0))} originales</small></div>
        {submissionStatus && <p className="submission-status"><span className="loader"/>{submissionStatus}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="secondary-button add-ticket-button" disabled={draftTickets.length >= MAX_TICKETS || isSubmitting} onClick={scanAnotherTicket} type="button"><CameraIcon size={19}/>{draftTickets.length >= MAX_TICKETS ? "Límite de 5 tickets alcanzado" : "Escanear otro ticket"}</button>
        <button className="primary-button full-button send-note-button" disabled={isSubmitting || draftTickets.length === 0} onClick={() => void submitNote()} type="button">{isSubmitting ? "Preparando envío…" : `Enviar nota con ${draftTickets.length} ${draftTickets.length === 1 ? "ticket" : "tickets"}`} {!isSubmitting && <ArrowIcon/>}</button>
      </div>}
      {step === "success" && <div className="screen success-screen">
        <div className="success-check"><CheckIcon size={40}/></div><span className="eyebrow">Nota enviada</span><h1>¡Todo listo!</h1><p>La nota de gastos y todos sus justificantes se ha creado correctamente.</p>
        <div className="summary-card"><div><span>Objeto</span><strong>{submittedNote?.objeto || "—"}</strong></div><div><span>Localidad</span><strong>{submittedNote?.localidad || "—"}</strong></div><div><span>Tickets</span><strong>{submittedNote?.tickets.length ?? 0}</strong></div><div className="summary-total"><span>Total</span><strong>{formatAmount(submittedNote?.tickets.reduce((total, ticket) => total + (ticket.importeTotal ?? 0), 0) ?? 0)} €</strong></div></div>
        <button className="primary-button full-button" onClick={startAgain} type="button">Crear otra nota <CameraIcon size={20}/></button>
        {expenseNotesUrl && <p className="success-note-link">Pincha <a href={expenseNotesUrl} rel="noopener noreferrer" target="_blank">aquí</a> para ver y/o editar la nota recién creada y enviarla.</p>}
      </div>}
      <footer><span className="lock-icon">⌾</span> Tus datos se procesan de forma segura</footer>
      <input accept="image/jpeg,image/png,image/bmp,image/tiff,image/heif,image/heic" capture="environment" className="sr-only" onChange={handleImage} ref={cameraInput} type="file"/><input accept="image/jpeg,image/png,image/bmp,image/tiff,image/heif,image/heic" className="sr-only" onChange={handleImage} ref={galleryInput} type="file"/>
    </section>
  </main>;
}

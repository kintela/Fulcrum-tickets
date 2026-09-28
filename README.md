Ticket scanner built with Next.js and Azure AI Document Intelligence.

## Microsoft Entra ID

The scanner requires a corporate Microsoft Entra ID session. Configure the single-tenant application registration and environment variables by following [ENTRA_SETUP.md](./ENTRA_SETUP.md).

## Azure Document Intelligence

The browser sends the selected receipt to `POST /api/receipts/analyze`. The Route Handler keeps the Azure key on the server, calls the `prebuilt-receipt` model, polls the asynchronous operation, and returns a normalized receipt contract to the UI.

Copy `.env.example` to `.env.local` and fill in the endpoint and key from your Azure Document Intelligence resource:

```bash
cp .env.example .env.local
```

The default upload limit is 4 MB so it also works with Azure's F0 tier. Set `RECEIPT_MAX_FILE_SIZE_BYTES` to a larger value when using a tier that supports it. Never prefix the Azure key with `NEXT_PUBLIC_`: it must remain server-only.

## Envío de notas

Una nota puede acumular entre uno y cinco tickets. Antes del envío, el navegador convierte sus imágenes a JPEG y las comprime hasta un presupuesto conjunto máximo de 3,8 MB. La llamada a la API matriz utiliza `multipart/form-data` con una parte `Datos` (`datos.json`) y una parte `Imagenes` repetida por cada ticket. Cada entrada de `tickets` en el JSON contiene un `idImagen` que coincide con el nombre del archivo correspondiente.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

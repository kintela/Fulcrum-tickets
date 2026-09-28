# Contrato de envío de una nota de gastos

La aplicación envía una nota completa mediante una única petición:

```http
POST /api/NotasGastos/ticket
Content-Type: multipart/form-data
```

El formulario contiene:

- `Datos`: archivo `datos.json` con tipo `application/json`.
- `Imagenes`: entre 1 y 5 archivos de imagen. La clave `Imagenes` se repite una vez por archivo.

Ejemplo conceptual:

```text
Datos=@datos.json;type=application/json
Imagenes=@550e8400-e29b-41d4-a716-446655440000.jpg;type=image/jpeg
Imagenes=@6ba7b810-9dad-11d1-80b4-00c04fd430c8.jpg;type=image/jpeg
```

## Contenido de `datos.json`

```json
{
  "email": "usuario@fulcrum.es",
  "objeto": "Visita comercial",
  "localidad": "Leioa",
  "tickets": [
    {
      "idImagen": "550e8400-e29b-41d4-a716-446655440000.jpg",
      "numeroTicket": "F171804",
      "comercio": "XCARET 6775 S.L.",
      "fecha": "2026-09-24",
      "conceptos": [
        {
          "concepto": "Menú día",
          "baseImponible": 16.09,
          "importeIva": 1.61,
          "importeTotal": 17.7
        }
      ],
      "baseImponible": 16.09,
      "importeIva": 1.61,
      "importeTotal": 17.7
    }
  ]
}
```

`idImagen` coincide exactamente con el nombre del archivo correspondiente en `Imagenes`. Los importes se envían como números JSON, no como cadenas con coma decimal.

## Firma orientativa en ASP.NET Core

```csharp
[HttpPost("ticket")]
[Consumes("multipart/form-data")]
public async Task<IActionResult> CrearNota(
    [FromForm] IFormFile Datos,
    [FromForm] List<IFormFile> Imagenes)
```

La API debería validar que haya entre 1 y 5 tickets, que exista una imagen por cada `idImagen` y guardar toda la nota de forma atómica.

La aplicación comprime el conjunto de imágenes antes del envío para dejarlo por debajo de 3,8 MiB, reservando margen para el JSON y la envoltura multipart dentro del límite de la plataforma.

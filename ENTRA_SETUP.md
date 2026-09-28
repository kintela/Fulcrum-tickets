# Configuración de Microsoft Entra ID

La aplicación usa OpenID Connect con una aplicación web confidencial de un solo tenant. El escáner y sus endpoints no están disponibles sin una sesión corporativa válida.

## 1. Registrar la aplicación

En **Microsoft Entra admin center > App registrations > New registration**:

- Nombre sugerido: `Fulcrum Tickets`.
- Tipo de cuenta: **Accounts in this organizational directory only**.
- Plataforma: **Web**.
- URI de redirección de desarrollo: `http://localhost:3000/api/auth/callback/azure-ad`.
- URI de redirección de producción: `https://<dominio-de-la-app>/api/auth/callback/azure-ad`.

Anotar **Application (client) ID** y **Directory (tenant) ID**.

## 2. Crear la credencial

En **Certificates & secrets**, crear un secreto de cliente para desarrollo. Copiar el valor en el momento de crearlo; después deja de mostrarse.

En producción, guardar las credenciales como secretos de la plataforma de despliegue o en Azure Key Vault. No deben incluirse en Git ni usar variables `NEXT_PUBLIC_*`.

## 3. Configurar el entorno

Copiar los siguientes valores a `.env.local`:

```env
AZURE_AD_TENANT_ID=<directory-tenant-id>
AZURE_AD_CLIENT_ID=<application-client-id>
AZURE_AD_CLIENT_SECRET=<client-secret-value>
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<secreto-aleatorio>
```

Generar el secreto de sesión con:

```bash
openssl rand -base64 32
```

En producción, `NEXTAUTH_URL` debe contener la URL HTTPS pública de la aplicación.

## 4. Controlar quién puede entrar

La autoridad y el claim `tid` se validan contra `AZURE_AD_TENANT_ID`, por lo que no se aceptan identidades emitidas por otros tenants.

Si no deben entrar todos los usuarios del tenant, activar **Assignment required** en la aplicación empresarial y asignar únicamente el grupo corporativo autorizado. Esta opción también permite excluir invitados aunque tengan un objeto dentro del tenant.

## 5. Proteger también la API matriz

La autenticación de esta aplicación impide utilizar sus pantallas y endpoints internos sin sesión. No protege por sí sola la URL pública de la API matriz. Para impedir llamadas directas, la API matriz debe validar un access token dirigido a su propio audience, tenant y scope/rol.

Para enviar el token delegado del usuario a la API matriz hace falta exponer un scope en el registro de la API y añadir ese scope como permiso delegado en el registro de `Fulcrum Tickets`. Esa integración se configura una vez conocidos el Application ID URI y el nombre del scope de la API.

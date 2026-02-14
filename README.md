# Padel por Link (MVP P0 local-first)

App web mobile-first para organizar partidos de padel por link (WhatsApp-first).

## Stack

- Frontend: Next.js App Router + Tailwind + componentes estilo shadcn/ui
- Backend: API routes de Next + Convex (modo real) con fallback mock para tests
- Realtime: Convex subscriptions para notificaciones + SSE en detalle de partido
- Auth: Firebase Phone Auth (real) y OTP emulado para tests
- Tests: Vitest (unit/integration) + Playwright (E2E)
- PWA minima: manifest + icons + meta tags + standalone
- Stack objetivo ya conectado en local: Convex + Firebase

## Requisitos

- Node.js 20+
- pnpm 10+

## Configuracion local

1. Instalar dependencias:

```bash
pnpm install
```

2. Crear variables de entorno:

```bash
cp .env.example .env.local
```

3. Iniciar en modo local MVP (mock backend + auth emulada):

```bash
pnpm dev:test
```

Abrir [http://127.0.0.1:3000](http://127.0.0.1:3000).

4. Para modo real local (Firebase + Convex), usar:

```bash
pnpm dev
```

Con `.env.local`:
- `NEXT_PUBLIC_USE_MOCK_BACKEND=false`
- `NEXT_PUBLIC_USE_AUTH_EMULATOR=false`

## Scripts

- Desarrollo normal: `pnpm dev`
- Desarrollo local MVP (recomendado para pruebas): `pnpm dev:test`
- Unit + integration: `pnpm test`
- Solo unit: `pnpm test:unit`
- Solo integration: `pnpm test:integration`
- E2E: `pnpm test:e2e`
- Build: `pnpm build`
- Lint: `pnpm lint`

## Cobertura funcional P0 implementada

- Inicio con tabs `Inicio` / `Mis partidos`
- Login OTP (flujo emulado local)
- Perfil (alias obligatorio)
- Crear partido
- Link publico de detalle
- Join/leave con cupos maximo 4 y control de concurrencia (integration test)
- Cancelar partido por organizador
- Estado automatico `abierta` / `cerrada` / `cancelada`
- Copiar resumen para WhatsApp (con emoji)
- Compartir link (Web Share API con fallback)
- Realtime en detalle via SSE
- Notificaciones in-app realtime (`/notificaciones`)
  - Tu cupo confirmado
  - Partido lleno (4/4)
  - Se liberó cupo
  - Partido cancelado
- Web Push PWA (`join` P0)
  - Suscripción push persistida por usuario/dispositivo
  - Envío push al organizador y participantes actuales (excepto quien se une)
  - Tap en push abre `/partido/[publicId]`

## Pruebas incluidas

### Unit (Vitest)

- Validacion de alias
- Derivacion de estado
- Conversion `datetime-local` (America/Bogota) a UTC y vuelta
- Formato del resumen de WhatsApp
- Formato de mensaje push `join` (Hoy/Mañana/fecha + hora)
- Resolución de receptores push (excluye siempre al jugador que entra)
- Utilidades cliente push (detección soporte + parseo VAPID base64url)

### Integration (Vitest)

- Crear partido con auto-join del organizador
- Join/leave y reapertura automatica
- Bloqueo de join en cancelado
- Concurrencia ultimo cupo (solo entra un jugador)

### E2E (Playwright)

- Crear partido
- Abrir link sin login
- Join/leave con auth emulada
- Cancelado visible y acciones bloqueadas
- Copiar resumen

### Verificación manual Web Push (P0)

1. Generar claves VAPID:

```bash
pnpm dlx web-push generate-vapid-keys --json
```

2. Configurar entorno:
   - Next (`.env.local`): `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
   - Convex env: `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`
3. Instalar la PWA en Home Screen en el dispositivo a probar.
4. Iniciar sesión como organizador y activar push en `/perfil`.
5. Con otro usuario, unirse al partido.
6. Verificar recepción de push y que al tocar abre `/partido/{publicId}`.

## Variables de entorno

### Necesarias para el flujo local MVP

- `NEXT_PUBLIC_APP_TIMEZONE=America/Bogota`
- `NEXT_PUBLIC_DEFAULT_PHONE_COUNTRY=CO`
- `NEXT_PUBLIC_USE_MOCK_BACKEND=true`
- `NEXT_PUBLIC_USE_AUTH_EMULATOR=true`

### Preparadas para Convex + Firebase (path futuro)

- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_AUTH_EMULATOR_HOST`

### Para notificaciones realtime en modo real

- `NEXT_PUBLIC_USE_MOCK_BACKEND=false`
- `NEXT_PUBLIC_CONVEX_URL` configurada
- Firebase Phone Auth funcionando para obtener ID token real

### Para Web Push PWA (`join` P0)

- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT` (ejemplo: `mailto:tu-correo@dominio.com`)
- `NEXT_PUBLIC_CONVEX_SITE_URL` (base URL para deep link de push)

## Estructura principal

- `app/`: rutas UI y API
- `src/domain/`: reglas de negocio
- `src/backend/`: servicio de dominio y utilidades HTTP
- `tests/unit`: pruebas unitarias
- `tests/integration`: pruebas de integracion
- `tests/e2e`: pruebas end-to-end
- `convex/`: schema y auth config base para migracion al backend Convex

## Path de deploy futuro (no parte de P0)

1. Crear proyecto Convex y configurar `CONVEX_DEPLOYMENT` + `NEXT_PUBLIC_CONVEX_URL`.
2. Activar Firebase Phone Auth en proyecto real y configurar variables `NEXT_PUBLIC_FIREBASE_*`.
3. Implementar bridge definitivo Firebase token -> Convex auth en funciones Convex.
4. Cambiar `NEXT_PUBLIC_USE_MOCK_BACKEND=false` y enrutar UI a Convex.
5. Configurar despliegue en Vercel con variables de entorno.
6. Ejecutar smoke tests post-deploy (`/`, `/crear`, `/partido/[id]`, join/leave/cancel).

# Cambios del contrato de reservas B2B en este repo

Bitácora de lo que cambiamos acá para cumplir el contrato del backend de Lilo. Cada
sección dice qué se tocó, por qué, cómo se verifica y qué NO se tocó. La referencia es
`Backend/Firebase/docs/CONTRATO_FRONTEND.md` (CF-90, CF-91, CF-92) y
`Backend/Firebase/docs/MIGRACION_FRONTEND.md`.

Regla de esta bitácora: se escribe en el mismo commit que el código, con las rutas y las
líneas reales. Si un cambio se revierte, su sección se marca como revertida, no se borra.

---

## F5 — El botón de cancelar aparece en toda reserva no despachada

**Qué se tocó.** `src/app/page.tsx` (el gate del botón «Cancelar Solicitud» del modal de
monitoreo) y `src/lib/tripStatus.ts` (la regla, declarada una sola vez).

### La condición anterior

`src/app/page.tsx:2675-2678` (líneas previas a este cambio), sobre el estado **ya normalizado**
por `mapRawTripStatus`:

```tsx
{(liveSelectedRequest.status === "requested" ||
  (liveSelectedRequest.status === "seeking_driver" &&
    !(liveSelectedRequest as any).startedAt &&
    !(liveSelectedRequest as any).interruptionReason)) && (
```

Tenía dos defectos.

1. **La reserva ya asignada no se podía cancelar.** `driver_assigned` se normaliza a
   `assigned` (`src/lib/tripStatus.ts:63-64`) y `assigned` no estaba en la lista, así que
   una reserva con conductor comprometido —el estado más caro de dejar en pie— quedaba sin
   botón, aunque el backend la acepta.
2. **La lista estaba enumerada a mano y no salía de ningún contrato.** Cada estado nuevo
   exigía acordarse del gate.

### La condición nueva

`src/app/page.tsx:2680`, una sola regla delegada a `src/lib/tripStatus.ts`:

```tsx
{isCompanyCancellableStatus(liveSelectedRequest.status) && (
```

```ts
export const COMPANY_CANCELLABLE_STATUSES: readonly B2BRequestStatus[] = [
  "requested",       // pending_approval
  "seeking_driver",  // available | offered | driver_rejected
  "assigned",        // driver_assigned
];

export function isCompanyCancellableStatus(status: string | null | undefined): boolean {
  return COMPANY_CANCELLABLE_STATUSES.includes(mapRawTripStatus(status));
}
```

Es una **lista blanca de los estados cancelables**, no una lista negra de los despachados: el
conjunto de estados de una reserva es cerrado y enumerado
(`functions/src/b2b/scheduledTripStatus.ts:49-59`), y una lista negra mostraría el botón ante
un estado que el backend no conoce y que rechazaría con `failed-precondition`.

### Estado → ¿se puede cancelar?

La columna «crudo» es el estado que escribe el backend; la columna «normalizado» es lo que
`mapRawTripStatus` deja en `liveSelectedRequest.status`, que es lo único que el gate ve.

| Estado crudo | Normalizado | ¿Botón de cancelar? | Por qué |
|---|---|---|---|
| `pending_approval` | `requested` | **sí** | Está en `CANCELLABLE_SCHEDULED_TRIP_STATUSES`; cancelarla libera su techo |
| `available` | `seeking_driver` | **sí** | Previa al despacho, en el pool |
| `offered` | `seeking_driver` | **sí** | Previa al despacho, ofrecida a un conductor |
| `driver_rejected` | `seeking_driver` | **sí** | Previa al despacho, no es terminal |
| `driver_assigned` | `assigned` | **sí** | **Nuevo**: es la reserva comprometida con un conductor |
| `dispatched` | `enRoute` | no | Ya es un viaje: se reporta y se reasigna (CF-87) |
| `completed` | `completed` | no | Post-despacho |
| `expired` | `cancelled` | no | Post-despacho; además ya es terminal |
| `cancelled` | `cancelled` | no | Post-despacho; además ya es terminal |
| *(ausente o desconocido)* | `requested` | sí | El backend responde con su lista; el portal no adivina |

### Dos hallazgos que conviene registrar

1. **`pending_approval` falta en la lista del contrato.** `CONTRATO_FRONTEND.md:6906` (CF-89)
   dice «Estados que aceptan cancelación de una reserva: `available`, `offered`,
   `driver_rejected`, `driver_assigned`» — cuatro. El código acepta **cinco**: agrega
   `pending_approval` (`functions/src/b2b/scheduledTripStatus.ts:103-109`, con su motivo
   escrito: una reserva pendiente tiene que poder cancelarse porque dejarla fuera dejaría
   dinero retenido que ningún barrido toca). La lista blanca sigue al código, que es la
   autoridad real, y no al párrafo.
2. **`requested` no es un estado de reserva, pero sí es el cubo de uno real.** No aparece en
   los nueve estados de `scheduledTripStatus.ts`; existe en el gate porque
   `mapRawTripStatus("pending_approval")` devuelve `requested` (`src/lib/tripStatus.ts:96-97`),
   que es un estado cancelable. Es también el destino por defecto de un estado ausente o
   desconocido. **No se puede nombrar el estado real en el gate**: el objeto que llega al
   modal ya perdió el crudo, porque `requests` lo sobrescribe con el normalizado
   (`src/app/page.tsx:554` y `:573`). Se conserva el cubo y se documenta qué contiene.

### Qué se quitó del gate, además de la enumeración

- `!(liveSelectedRequest as any).startedAt` — **código muerto**: `startedAt` no se escribe en
  ninguna parte de este repo (única aparición: la que se borró).
- `!(liveSelectedRequest as any).interruptionReason` — ocultaba el botón mientras la reserva
  se reasigna (el cartel «Incidencia en ruta reportada» de `page.tsx:2386`). Se quitó a
  propósito: en la reasignación la reserva vuelve al pool (`available` / `offered` /
  `driver_rejected`), que es exactamente uno de los estados que el backend acepta, y
  cancelarla ahí libera el techo. Ocultarlo era una denegación inventada por el portal.

### Qué NO se tocó

- `src/lib/tripStatus.ts` más allá de la regla nueva: el mapeo sigue igual
  (`dispatched` → `enRoute`, `driver_assigned` → `assigned`). Corregirlo es F7.
- La elección de callable (`handleCancelRequest`, `page.tsx:1210-1224`): ya reparte bien entre
  `cancelScheduledTrip` y `cancelCompanyReservation`.
- El permiso por rol: el botón sigue deshabilitado para roles que no son `operator` ni
  `company_admin`, con su `title` explicativo.

### Cómo se verifica

```bash
npx tsc --noEmit  # exit 0
npm run lint      # exit 1, y ya salía 1 antes de este cambio (ver abajo)
```

**`npm run lint` no pasa en este repo, y este cambio no lo empeora.** El baseline del
commit base tiene 150 problemas (103 errores, 47 warnings) repartidos en 13 archivos
(`src/types/b2b.ts`, `src/lib/googleMaps.ts`, `src/context/*`, `src/app/solicitudes/nueva/page.tsx`,
…), casi todos `@typescript-eslint/no-explicit-any` que nadie limpió. Los dos archivos que
toca esta sección quedan así:

| Archivo | Antes (`git show HEAD:…`) | Después |
|---|---|---|
| `src/app/page.tsx` | 62 errores, 16 warnings | 60 errores, 16 warnings |
| `src/lib/tripStatus.ts` | limpio | limpio |
| repo completo | 103 errores, 47 warnings | 101 errores, 47 warnings |

El gate viejo aportaba dos de esos errores (los `as any`); la regla nueva no agrega ninguno.
El rojo de `lint` es anterior a F5 y se arregla fuera de este alcance.

Verificación funcional de la regla, sin emulador y sin escribir en el worktree: se transpila
`src/lib/tripStatus.ts` en memoria con el compilador del proyecto y se recorre la matriz de
estados del backend.

```bash
node -e '
const fs = require("fs"), ts = require("typescript"), vm = require("vm");
const js = ts.transpileModule(fs.readFileSync("src/lib/tripStatus.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { exports: mod.exports, module: mod });
const t = mod.exports;
const cases = {
  pending_approval: true, available: true, offered: true, driver_rejected: true,
  driver_assigned: true, dispatched: false, completed: false, expired: false,
  cancelled: false, "": true, inventado: true,
  requested: true, seeking_driver: true, assigned: true,
  enRoute: false, driverArrived: false, inService: false, arrived: false,
  invoiced: false, rejected: false, confirmed: false,
  null: true, undefined: true,
};
let fail = 0;
for (const [raw, want] of Object.entries(cases)) {
  const arg = raw === "null" ? null : raw === "undefined" ? undefined : raw;
  const got = t.isCompanyCancellableStatus(arg);
  if (got !== want) { console.error("FALLA", JSON.stringify(raw), got, want); fail++; }
}
console.log(fail === 0 ? "matriz OK: " + Object.keys(cases).length + " casos" : "FALLAS: " + fail);
process.exit(fail === 0 ? 0 : 1);
'
# matriz OK: 23 casos   (exit 0)
```

Y a ojo, en la consola de empresa: una reserva en `driver_assigned` (badge «Conductor
Asignado») ahora muestra «Cancelar Solicitud»; una en `dispatched` o posterior, no.

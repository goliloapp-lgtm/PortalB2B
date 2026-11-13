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

---

## F6 — El techo se muestra completo en el selector

**Qué se tocó.** `src/app/solicitudes/nueva/page.tsx` (el selector de centro de costo del
alta, los dos efectos que cargan los centros y el reparto del envío) y `src/app/page.tsx`
(el respaldo legado del panel de centros). La regla del techo queda declarada una sola vez,
en `formatCostCentreCeiling`.

### La fórmula

```
usado     = Number(cc.spent || 0) + Number(cc.reserved || 0)
techo     = cc.budgetLimit   (number)  →  « · Techo $<techo> · Consumido + reservado $<usado>»
             cc.budgetLimit ausente/null →  « · sin límite definido · Consumido + reservado $<usado>»
```

**El techo es `budgetLimit` y nada más.** `reserved` es dinero comprometido por reservas
vivas que todavía no se realizaron (`reserved → spent` al cerrar), así que el consumo real
de un centro es la suma y no `spent` a solas. Mostrar sólo `spent` dejaba al operador con
la impresión de que tenía todo el techo libre cuando la mitad ya estaba reservada.

**`monthlyBudget` no es el techo y dejó de ser el respaldo.** La línea anterior era
`cc.budgetLimit ?? cc.monthlyBudget ?? null` (`nueva/page.tsx:1242` y `page.tsx:1594`
antes de este cambio). `budgetLimit` ausente significa **SIN LÍMITE**
(`CONTRATO_FRONTEND.md`, CF-23) y el backend no aplica `monthlyBudget` a nada: usarlo como
respaldo mostraba un número que ninguna llamada iba a respetar, que es peor que no mostrar
ninguno. Ahora, sin `budgetLimit`, el centro se lista **sin techo** y con el texto «sin
límite definido» más el acumulado real, que sí es un dato.

### Los cuatro casos

| Centros en la empresa | Qué hace el selector | Qué manda el envío |
|---|---|---|
| **0** | Sólo el texto «Sin centro de costo registrado en la empresa»; no hay nada que elegir | `costCentreId: undefined`; no hay guarda que dispare |
| **1** | **Se autoselecciona el único**: sin una elección real no hay nada que decidir y elegir de una lista de uno es ceremonia | El id de ese centro |
| **varios** | **Arranca vacío**, con la opción `-- Seleccionar centro de costo --`. **El selector no elige solo** | Hasta que el operador elija, `handleSubmit` corta con «Por favor selecciona el departamento o centro de costo al que corresponde este traslado.» (`nueva/page.tsx:628-632`). Con elección, el id elegido |
| **sin `budgetLimit`** (el centro existe, el techo no) | «· sin límite definido · Consumido + reservado $X» — sin techo que comparar, sin número inventado | Igual: la falta de techo no es falta de centro |

La elección previa se conserva mientras el centro siga existiendo y activo; una elección
que desapareció de la lista vuelve a vacío. Esa regla vive en una sola función
(`resolveCostCentreSelection`) que usan los dos caminos de carga — el callable
`listCostCentresCallable` y el `onSnapshot` de `costCenters` —, en lugar de estar escrita
dos veces con la misma forma. La regla es la misma del dashboard de plataforma: se
autoselecciona sólo cuando no hay nada que elegir.

### Por qué la guarda de `handleSubmit` ahora se ejercita

Las dos cargas terminaban en la misma expresión, una por camino:

```tsx
setCostCenterId((prev) =>
  prev && mapped.some((c) => c.id === prev) ? prev : mapped[0].id
);
```

Con eso, `costCenterId` nunca estaba vacío con centros cargados y la guarda
`costCenters.length > 1 && !costCenterId` (`nueva/page.tsx:628`) no se podía alcanzar. Con
la autoselección limitada al caso de un solo centro, la guarda es el camino normal de un
operador con varios centros que pulsa «Solicitar» sin elegir, y el error se ve en pantalla
en lugar de salir del backend como `failed-precondition`.

También se acotó el atajo del envío: `costCenters[0]` era el respaldo de un id ausente y
elegía por el operador. Ahora sólo se usa cuando la empresa tiene exactamente un centro.

### Qué NO se tocó

- El mapeo de estados de una reserva (`src/lib/tripStatus.ts`, `mapRawTripStatus`): F5 lo
  dejó como está y corregirlo es F7.
- El reparto de callables de cancelación (`handleCancelRequest`): ya reparte bien y es F7.
- Quién ve el texto del techo: sigue siendo `isCompanyAdmin` el que lo ve en el selector,
  igual que antes. Ampliarlo a todos los roles es una decisión de visibilidad que este
  cambio no toma.
- El panel de centros de `page.tsx` en todo lo demás: sólo perdió el respaldo
  `monthlyBudget`. La edición del techo sigue por `updateCostCentreCallable` («Vacío =
  SIN LÍMITE», botón `∞`) y la etiqueta «SIN LÍMITE» sigue igual.

### Cómo se verifica

```bash
npx eslint src/app/page.tsx src/app/solicitudes/nueva/page.tsx   # 102 problemas, los mismos de antes
npx tsc --noEmit                                                 # exit 0
```

`eslint` no suma ni un problema: el conteo por archivo es idéntico al de `HEAD`
(`src/app/page.tsx` 60 errores y 16 warnings, `src/app/solicitudes/nueva/page.tsx`
9 errores y 17 warnings; 102 en total), y todos son los `@typescript-eslint/no-explicit-any`
y `no-unused-vars` que ya estaban. El rojo de `lint` en este repo es anterior a F6.

La lógica de las dos funciones se ejercita sin navegador, extrayendo su fuente del archivo
real, transpilándola en memoria y corriendo la matriz (scratch fuera del worktree):

```js
// techo: spent + reserved contra budgetLimit
{ budgetLimit: 1200, spent: 300, reserved: 145.5 } → " · Techo $1200.00 · Consumido + reservado $445.50"
{ budgetLimit: 500,  spent: 100, reserved: 0 }     → " · Techo $500.00 · Consumido + reservado $100.00"
{ budgetLimit: 100,  spent: 42 }                   → " · Techo $100.00 · Consumido + reservado $42.00"   // reserved ausente = 0
{ budgetLimit: null, spent: 80, reserved: 20 }     → " · sin límite definido · Consumido + reservado $100.00"
{ budgetLimit: undefined, spent: 0, reserved: 0 }  → " · sin límite definido · Consumido + reservado $0.00"
{ budgetLimit: null, monthlyBudget: 999, spent: 10, reserved: 5 }
                                                   → " · sin límite definido · Consumido + reservado $15.00"  // legado ignorado

// selección: 0 / 1 / varios
[] , ""                  → ""        // 0 centros: nada que elegir
[] , "a"                 → ""        // la elección previa no sobrevive a una lista vacía
[unico] , ""             → "unico"   // 1 centro: se autoselecciona
[unico] , "unico"        → "unico"   // y se conserva
[a, b] , ""              → ""        // varios: arranca vacío, elige el operador
[a, b] , "b"             → "b"       // varios: se respeta la elección del operador
[a, b] , "z"             → ""        // varios: una elección inexistente no se inventa
# matriz OK: 13 casos   (exit 0)
```

Y a ojo, en la consola de empresa con dos centros (`Operaciones` con techo $1,200 y
`spent` $300 + `reserved` $145.50; `Administración` sin `budgetLimit`): el selector arranca
en «-- Seleccionar centro de costo --», la primera opción dice
«Operaciones · Techo $1200.00 · Consumido + reservado $445.50», la segunda dice
«Administración · sin límite definido · Consumido + reservado $0.00», y pulsar «Solicitar»
sin elegir muestra el mensaje de la guarda en vez de enviar la reserva.

---

## F7 — Los estados son los del backend

**Qué se tocó.** `src/lib/tripStatus.ts` (el vocabulario normalizado, la escalera y el mapeo) y
`src/app/page.tsx` (las etiquetas, el filtro, el KPI y la línea de tiempo que los consumen).

La reserva (`scheduledTrips`) escribe **ocho** estados —`available`, `offered`, `driver_rejected`,
`driver_assigned`, `dispatched`, `completed`, `cancelled`, `expired`— más `pending_approval`, que crea
la vía de excepción de plataforma (CF-84, `functions/src/b2b/scheduledTripStatus.ts:22`). Eso es lo
que muestra la consola.

### El vocabulario viejo

Doce valores normalizados, de los cuales seis no los escribe ninguna reserva:

| Normalizado viejo | Quién lo escribía de verdad | En F7 |
|---|---|---|
| `requested` | Nadie: era el cubo por defecto, el de `pending_approval` y el de `b2bRequests` | `pending_approval` o `available`, según el crudo |
| `seeking_driver` | Un cubo para `available` + `offered` + `driver_rejected` (y el `seeking_driver` de `trips`) | Los tres de reserva, cada uno con su nombre; el del viaje cae en `dispatched` |
| `confirmed` | **Nadie.** No existe en el backend | **Eliminado** |
| `assigned` | Cubo de `driver_assigned` | `driver_assigned` |
| `enRoute` | Nadie: lo llenaba `accepted`/`dispatched` | `dispatched` |
| `driverArrived` | Nadie: lo llenaba `driver_arrived` | `dispatched` |
| `inService` | Nadie: lo llenaba `in_progress` | `dispatched` |
| `arrived` | Nadie lo escribe una reserva: es un estado de `trips` | `dispatched` |
| `completed` | Sí | `completed` |
| `invoiced` | **Nadie.** El cierre es `completed` | **Eliminado** |
| `cancelled` | Sí, pero se tragaba `expired` | `cancelled`, solo |
| `rejected` | **Nadie** en una reserva (sí en una solicitud de centro de costo, otro dominio) | **Eliminado** |

### El vocabulario nuevo

`mapRawTripStatus` (`src/lib/tripStatus.ts:82`) es la única normalización y su tabla quedó documentada
en el propio archivo. La regla de cancelación (`isCompanyCancellableStatus`, `:212`) sale de la lista
del backend (`CANCELLABLE_SCHEDULED_TRIP_STATUSES`, `functions/src/b2b/scheduledTripStatus.ts:103`):

| Crudo | Normalizado | ¿Se cancela? | Paso de la escalera |
|---|---|---|---|
| `pending_approval` | `pending_approval` | sí | 0 · Reserva creada |
| `available` | `available` | sí | 0 · Reserva creada |
| `offered` | `offered` | sí | 1 · Ofrecida |
| `driver_rejected` | `driver_rejected` | sí | 0 · Reserva creada (volvió al pool) |
| `driver_assigned` | `driver_assigned` | sí | 2 · Conductor asignado |
| `dispatched` | `dispatched` | no: ya es un viaje | 3 · Despachada |
| `completed` | `completed` | no | 4 · Completada |
| `expired` | `expired` | no | — (fuera de la escalera) |
| `cancelled` | `cancelled` | no | — (fuera de la escalera) |
| `requested` · `accepted` · `seeking_driver` · `driver_arrived` · `arrived` · `in_progress` (de `trips`) | `dispatched` | no | 3 · Despachada |
| ausente o desconocido | `available` | sí | 0 · Reserva creada |

La consola no baja el estado de una reserva por el detalle del viaje: si existe un viaje vivo
(`listCompanyTrips`), la reserva ya se despachó, y sólo `completed` o `cancelled` del viaje la bajan a
un terminal (`src/app/page.tsx:446-458`). El «en camino / en punto / a bordo» se lee en el mapa y en la
bitácora del servidor, no en el estado de la reserva.

### `expired` ya no se lee como `cancelled`

| | Badge | Color | Línea de tiempo | Filtro |
|---|---|---|---|---|
| `expired` | «Vencida» | violeta `#F3F0FF` / `#7C3AED` (`page.tsx:141`) | «Reserva vencida: llegó la fecha límite sin ejecutarse y el techo se liberó.» | `expired` |
| `cancelled` | «Cancelada» | salmón `#FDEDE8` / `#FA896B` | «Reserva cancelada: no se ejecutó y el techo comprometido se liberó.» | `cancelled` |

Las dos están fuera de la lista de cancelables y las dos quedan fuera del KPI de gasto, pero se leen
distinto. La escalera no las marca como alcanzadas: `getLifecycleStepIndex` devuelve `-1` para las dos
(`src/lib/tripStatus.ts:141`), porque un terminal no es un paso hacia adelante.

### La escalera

La escalera vieja tenía nueve pasos e incluía cuatro que ninguna reserva escribe (`enRoute`,
`driverArrived`, `inService`, `arrived`) y uno inventado (`confirmed`). La nueva tiene cinco, todos
derivados de estados reales:

```ts
LIFECYCLE_STEPS = [
  "available",       // Reserva creada (en el pool)
  "offered",         // Ofrecida a un conductor
  "driver_assigned", // Conductor asignado
  "dispatched",      // Despachada (en viaje)
  "completed",       // Completada
];
```

`pending_approval` y `driver_rejected` caen al paso 0: la reserva existe y no tiene conductor
comprometido. `cancelled` y `expired` no están en la escalera.

### F5 sigue dando lo mismo

La regla de F5 no cambió de comportamiento: para los nueve estados crudos que el backend escribe,
`isCompanyCancellableStatus` devuelve lo mismo que en `HEAD`. Lo que cambió es la lista interna, que
ahora nombra cada estado real en vez de tres cubos (`requested`, `seeking_driver`, `assigned`).
También se mantiene la idempotencia de `mapRawTripStatus` sobre todo valor normalizado, así que la
escalera puede recibir el estado ya normalizado de `liveSelectedRequest`.

### Qué NO se tocó

- El reparto de callables de `handleCancelRequest` (F5): sigue eligiendo
  `cancelScheduledTrip` / `cancelCompanyReservation` igual, y el botón sigue colgando de
  `isCompanyCancellableStatus` (`page.tsx:2701`).
- El selector de centros y el techo de F6.
- `src/types/b2b.ts` queda fuera de esta entrega: su `B2BRequestStatus` describe el documento legado de
  `b2bRequests` (colección sin escritor desde el 2026-11-06). `page.tsx` deriva un `PortalRequest` con el
  estado normalizado, en lugar de forzar el tipo viejo.
- La lectura de `b2bRequests`: sigue abierta, y un documento viejo con un estado que el backend no
  escribe cae en `available`, el estado en que nace una reserva.

### Cómo se verifica

```bash
npx eslint src/lib/tripStatus.ts src/app/page.tsx   # tripStatus limpio; page.tsx 60 errores + 16 warnings, los de HEAD
npx tsc --noEmit                                    # exit 0
```

La matriz crudo → normalizado → cancelable se corre sin navegador, compilando el archivo real con
`tsc` y comparando la regla de F5 contra una copia de `HEAD` (scratch fuera del worktree):

```text
crudo              -> normalizado       cancelable  paso  escritor
------------------    ----------------   ----------  ----  --------
pending_approval   -> pending_approval   sí          0     createScheduledTripForCompany (CF-84)
                     ^ paso: Reserva creada (en el pool)
available          -> available          sí          0     createScheduledTrip (CF-48) / releaseScheduledTrip
                     ^ paso: Reserva creada (en el pool)
offered            -> offered            sí          1     offerScheduledTrip (CF-59)
                     ^ paso: Ofrecida a un conductor
driver_rejected    -> driver_rejected    sí          0     rejectScheduledTrip (CF-58)
                     ^ paso: Reserva creada (en el pool)
driver_assigned    -> driver_assigned    sí          2     acceptScheduledTrip (CF-57)
                     ^ paso: Conductor asignado
dispatched         -> dispatched         no          3     dispatchScheduledTrip (CF-62)
                     ^ paso: Despachada (en viaje)
completed          -> completed          no          4     cierre del viaje
                     ^ paso: Completada
expired            -> expired            no          -1    expireScheduledTrips
cancelled          -> cancelled          no          -1    cancelScheduledTrip (CF-54)
requested          -> dispatched         no          3     trips (listCompanyTrips)
                     ^ paso: Despachada (en viaje)
accepted           -> dispatched         no          3     trips (listCompanyTrips)
                     ^ paso: Despachada (en viaje)
seeking_driver     -> dispatched         no          3     trips (listCompanyTrips)
                     ^ paso: Despachada (en viaje)
driver_arrived     -> dispatched         no          3     trips (listCompanyTrips)
                     ^ paso: Despachada (en viaje)
arrived            -> dispatched         no          3     trips (listCompanyTrips)
                     ^ paso: Despachada (en viaje)
in_progress        -> dispatched         no          3     trips (listCompanyTrips)
                     ^ paso: Despachada (en viaje)
(ausente)          -> available          sí          0     reserva recién creada
                     ^ paso: Reserva creada (en el pool)
                   -> available          sí          0     valor vacío
                     ^ paso: Reserva creada (en el pool)
otro-inventado     -> available          sí          0     desconocido
                     ^ paso: Reserva creada (en el pool)

F5 (cancelación) antes vs después, sobre los estados crudos reales:
  pending_approval   antes=true  después=true
  available          antes=true  después=true
  offered            antes=true  después=true
  driver_rejected    antes=true  después=true
  driver_assigned    antes=true  después=true
  dispatched         antes=false después=false
  completed          antes=false después=false
  expired            antes=false después=false
  cancelled          antes=false después=false

matriz OK: 18 filas, 0 discrepancias; F5 idéntico en 9 estados
```

`expired` aparece como `expired` y ya no como `cancelled`; la matriz falla si vuelve a colapsarse, si
un estado cancelable deja de serlo o si un paso de la escalera deja de ser un estado real.

## F7b — El tipo compartido de estados se parte en real y heredado

`src/types/b2b.ts` seguía declarando el vocabulario viejo como si fuera el único. Un
tipo compartido que miente es peor que no tenerlo: el próximo componente que lo use
vuelve a pintar `confirmed` o `enRoute` sin que nadie lo note.

- `B2BRequestStatus` ahora son los nueve estados que el backend escribe:
  `pending_approval`, `available`, `offered`, `driver_rejected`, `driver_assigned`,
  `dispatched`, `completed`, `expired`, `cancelled`.
- `LegacyB2BRequestStatus` queda marcado `@deprecated` con los doce valores viejos, para
  tipar documentos heredados que todavía se leen. No se usa para escribir.
- `B2BAnyRequestStatus` es la unión, y es el tipo del campo `status` de
  `B2BServiceRequest`, que tipa documentos crudos (nuevos o viejos).

Verificación: `npx tsc --noEmit` exit 0, sin errores. El único consumidor del tipo es
`src/app/page.tsx`, que ya deriva su propio `PortalRequest` desde el estado normalizado.

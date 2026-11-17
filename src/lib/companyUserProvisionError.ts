/**
 * CF-103: el alta de un colaborador dice en qué paso falló, y el código se cita.
 *
 * `createCompanyUser` dejó de devolver un `internal` indistinguible: cada paso que
 * puede fallar prefija su código —`INV-1` la guarda de conductor, `INV-2` la cuenta,
 * `INV-3` el correo de bienvenida, `INV-4` la transacción— y ese código viaja en el
 * mensaje. Hasta acá esta pantalla traducía CUALQUIER error a «verifica su correo»,
 * y el correo no tenía nada de malo: el reporte del 2026-11-17 costó horas por eso.
 *
 * La regla de la pantalla es un texto fijo por código, y el código del paso a la
 * vista para que quien reporta pueda citarlo sin copiar el mensaje.
 *
 * EL MENSAJE DEL SERVIDOR NO SE MUESTRA NUNCA. Lleva el correo completo —y, en la
 * guarda de conductor, el uid— además de redacción interna en inglés. Sólo se lee
 * para dos cosas: distinguir la guarda de conductor y extraer el código `INV-n`.
 *
 * @see docs/CONTRATO_FRONTEND.md CF-103
 */

/** Un texto fijo de pantalla y, si el fallo fue de un paso, el código que lo nombra. */
export interface CompanyUserProvisionFailure {
  /** Texto fijo por código. Nunca contiene el mensaje del servidor. */
  message: string;
  /** `INV-n` cuando el fallo ocurrió dentro de un paso; se muestra en el texto. */
  stepCode?: string;
}

const INV_CODE = /INV-[1-5]/;

/**
 * Lee una propiedad de texto de un valor que puede no ser un objeto.
 *
 * @param {unknown} value El error recibido, de forma y origen desconocidos.
 * @param {string} key La propiedad a leer.
 * @return {string} El texto, o la cadena vacía si no está o no es texto.
 */
function readText(value: unknown, key: string): string {
  if (value === null || typeof value !== "object") return "";
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : "";
}

/**
 * Traduce un fallo del alta de un usuario de empresa al texto fijo de CF-103.
 *
 * Devuelve `undefined` cuando el código no está en la tabla: el llamador decide su
 * respaldo, y esta función no inventa un texto para lo que no conoce.
 *
 * @param {unknown} error El rechazo del callable, tal como llegó.
 * @return {CompanyUserProvisionFailure | undefined} El texto fijo, o `undefined`.
 */
export function describeCompanyUserProvisionFailure(
  error: unknown
): CompanyUserProvisionFailure | undefined {
  const code = readText(error, "code").toLowerCase();
  // `message` y `details` son las dos mitades donde puede viajar el código del paso:
  // el SDK de Functions pone el mensaje del servidor en `message`, y el `details`
  // del `HttpsError` viaja aparte. Se leen los dos y no se muestra ninguno.
  const raw = `${readText(error, "message")} ${readText(error, "details")}`;
  const stepCode = INV_CODE.exec(raw)?.[0];

  if (code.includes("internal")) {
    if (stepCode !== undefined) {
      return {
        message: `El alta falló en el paso ${stepCode} de 5. Cita ese código a soporte.`,
        stepCode,
      };
    }
    return { message: "El alta falló antes de empezar." };
  }

  if (code.includes("already-exists")) {
    return { message: "Ese correo ya tiene una cuenta." };
  }

  if (code.includes("failed-precondition")) {
    // La guarda de conductor es el ÚNICO `failed-precondition` que escribe
    // «conductor» en su mensaje, y la prueba del backend lo fija
    // (`functions/tests/createCompanyUser.test.js`). Leerlo para elegir el texto
    // no es mostrarlo: si la palabra no aparece, va el texto genérico.
    return raw.toLowerCase().includes("conductor")
      ? {
          message:
            "Ese correo pertenece a una cuenta de conductor, y un conductor no es usuario de empresa.",
        }
      : {
          message:
            "La empresa no tiene completa la configuración del correo de bienvenida.",
        };
  }

  if (code.includes("invalid-argument")) {
    return { message: "Revisa los datos de la invitación." };
  }

  if (code.includes("permission-denied")) {
    return { message: "Tu rol no puede dar de alta usuarios de esta empresa." };
  }

  if (code.includes("not-found")) {
    return { message: "No encontramos la empresa." };
  }

  if (code.includes("unauthenticated")) {
    return { message: "Tu sesión expiró." };
  }

  return undefined;
}

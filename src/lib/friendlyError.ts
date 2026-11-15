/**
 * Convierte cualquier error técnico (Firebase Auth, Cloud Functions HttpsError,
 * Firestore, red o validaciones) en un mensaje claro, amable y en español
 * comprensible para cualquier usuario no técnico.
 */
/**
 * La negativa P4: la reserva no entra en el techo del centro de costo.
 *
 * El servidor la cuenta entera —techo, consumido, retenido y lo que pide la
 * reserva— en inglés. El empleado de la empresa necesita esos números para saber
 * qué hacer: pedir que amplíen el techo, esperar a que se libere una reserva o
 * elegir un servicio más económico.
 *
 * @param {string} combined El texto del servidor en minúsculas.
 * @return {string | undefined} La frase, o `undefined` si no es esta negativa.
 */
function readCeilingRefusal(combined: string): string | undefined {
  if (!combined.includes("would be occupied against it")) return undefined;

  const number = "([0-9]+(?:\\.[0-9]+)?)";
  const pick = (pattern: string): number | undefined => {
    const match = new RegExp(pattern.replace("%s", number)).exec(combined);
    return match ? Number(match[1]) : undefined;
  };

  const needs = pick("needs %s");
  const ceiling = pick("ceiling is %s");
  const realised = pick("%s is realised") ?? 0;
  const reserved = pick("%s is reserved") ?? 0;
  const money = (value: number): string => `$${value.toFixed(2)}`;
  const head =
    "No se puede registrar esta reserva: supera el techo de consumo del centro de costo";

  if (needs === undefined || ceiling === undefined) return `${head}.`;

  const available = ceiling - realised - reserved;
  return (
    `${head}. Techo ${money(ceiling)}, consumido ${money(realised)}, ` +
    `retenido ${money(reserved)} — disponibles ${money(available)} — y esta ` +
    `reserva pide ${money(needs)}. Pedile a la plataforma ampliar el techo, ` +
    "esperá a que se libere una reserva o elegí un servicio más económico."
  );
}

export function formatFriendlyError(
  err: unknown,
  fallbackMessage = "No pudimos completar tu solicitud en este momento. Por favor intenta nuevamente."
): string {
  if (!err) return fallbackMessage;

  const rawMessage =
    typeof err === "string"
      ? err
      : typeof (err as any)?.message === "string"
      ? (err as any).message
      : "";
  const rawCode =
    typeof (err as any)?.code === "string" ? (err as any).code : "";
  // EL DETALLE DEL SERVIDOR TAMBIÉN CUENTA. Las negativas de negocio —techo de
  // consumo, techo del centro de costo, anticipación— viajan en
  // `err.details.message`, y hasta ahora este traductor no lo leía: ninguna regla
  // podía reconocerlas y el empleado recibía el genérico «no pudimos completar tu
  // solicitud» sin saber qué pasaba.
  const serverDetail =
    typeof (err as any)?.details === "string"
      ? (err as any).details
      : typeof (err as any)?.details?.message === "string"
      ? (err as any).details.message
      : "";
  const combined = `${rawCode} ${rawMessage} ${serverDetail}`.toLowerCase();

  // 1. Anticipación mínima de reserva (minimumBookingLeadMinutes)
  if (
    combined.includes("minimumbookingleadminutes") ||
    combined.includes("leaves ") ||
    combined.includes("requires at least")
  ) {
    const reqMatch = rawMessage.match(/requires at least\s+(\d+)/i);
    const reqMinutes = reqMatch ? Number(reqMatch[1]) : 180;
    const hours = Math.round((reqMinutes / 60) * 10) / 10;
    const timeLabel =
      reqMinutes >= 60 && reqMinutes % 60 === 0
        ? `${hours} ${hours === 1 ? "hora" : "horas"}`
        : `${reqMinutes} minutos`;
    return `La hora de salida seleccionada es muy próxima. Por política de tu empresa, las reservas deben programarse con al menos ${timeLabel} de anticipación. Por favor elige una hora más tarde.`;
  }

  // 2. Viajes inmediatos deshabilitados (allowsImmediateTrips)
  if (
    combined.includes("allowsimmediatetrips") ||
    combined.includes("immediate trip") ||
    combined.includes("inmediatos inhabilitados")
  ) {
    return "Por el momento tu empresa tiene habilitadas únicamente las reservas programadas. Por favor selecciona una fecha y hora de salida.";
  }

  // 0. Techo de consumo (P4): la reserva no entra. Va primero porque es la única
  // negativa que trae los cuatro números que el empleado necesita para decidir.
  const ceilingRefusal = readCeilingRefusal(combined);
  if (ceilingRefusal !== undefined) return ceilingRefusal;

  // 3. Presupuesto / Techo del centro de costo agotado
  // Sólo las frases con las que el backend NOMBRA el techo. Antes entraba cualquier
  // mensaje que dijera «budget» o «presupuesto», y el rechazo de `updateCompany`
  // termina con «the balance to the budget ledger»: cualquier invalid-argument se
  // mostraba como techo agotado y la causa real se perdía.
  if (
    combined.includes("resource-exhausted") ||
    combined.includes("budgetlimit") ||
    combined.includes("raise the ceiling") ||
    combined.includes("techo de consumo")
  ) {
    return "El departamento o centro de costo seleccionado ha alcanzado su presupuesto máximo para este periodo. Solicita al administrador de tu empresa ampliar el límite.";
  }

  // 4. Capacidad máxima de pasajeros (> 12)
  if (
    combined.includes("12 pasajeros") ||
    combined.includes("12 passengers") ||
    combined.includes("passengercount")
  ) {
    return "Para viajes de más de 12 pasajeros, por favor contáctanos directamente por WhatsApp o teléfono y con gusto coordinaremos tu traslado.";
  }

  // 5. Centro de costo requerido o inválido
  if (
    combined.includes("costcentre") ||
    combined.includes("costcenter") ||
    combined.includes("cost centre")
  ) {
    return "Por favor selecciona un departamento o centro de costo válido para continuar.";
  }

  // 6. Viajero corporativo requerido o inactivo
  if (combined.includes("traveller")) {
    return "Por favor selecciona un pasajero corporativo activo o regístralo antes de solicitar el traslado.";
  }

  // 7. Categoría vehicular o tarifa
  if (
    combined.includes("categoryid") ||
    combined.includes("vehicle category") ||
    combined.includes("farerate")
  ) {
    return "No pudimos calcular la tarifa para la categoría de vehículo seleccionada. Por favor intenta nuevamente.";
  }

  // 8. Cancelación no permitida por estado del viaje
  // Sólo las frases con las que el backend NIEGA la cancelación. Antes bastaba un
  // mensaje que dijera «cancel» y trajera el código del error.
  if (
    combined.includes("cannot be cancelled") ||
    combined.includes("cannot be canceled") ||
    combined.includes("already in progress") ||
    combined.includes("already completed") ||
    combined.includes("is cancelled by the trip path") ||
    combined.includes("nothing left to cancel")
  ) {
    return "No es posible cancelar este traslado porque ya se encuentra en curso o ya fue finalizado.";
  }

  // 9. Conductor o vehículo no disponible
  if (
    combined.includes("vehicle") ||
    combined.includes("driver") ||
    combined.includes("conductor")
  ) {
    if (
      combined.includes("not available") ||
      combined.includes("already assigned") ||
      combined.includes("eligible") ||
      combined.includes("failed-precondition")
    ) {
      return "El conductor o vehículo seleccionado no está disponible en este momento. Por favor elige otra unidad.";
    }
  }

  // 10. Errores de inicio de sesión y autenticación
  if (
    combined.includes("auth/invalid-credential") ||
    combined.includes("auth/wrong-password") ||
    combined.includes("auth/user-not-found") ||
    combined.includes("credenciales incorrectas")
  ) {
    return "El correo electrónico o la contraseña no son correctos. Por favor verifica tus datos e intenta de nuevo.";
  }

  if (combined.includes("auth/invalid-email")) {
    return "El formato del correo electrónico no es válido. Por favor revísalo.";
  }

  if (combined.includes("auth/too-many-requests")) {
    return "Has realizado demasiados intentos seguidos. Por seguridad, espera unos minutos antes de volver a intentarlo.";
  }

  if (
    combined.includes("auth/email-already-in-use") ||
    (combined.includes("already-exists") && combined.includes("email"))
  ) {
    return "Este correo electrónico ya está registrado en la plataforma.";
  }

  if (combined.includes("auth/weak-password")) {
    return "La contraseña elegida es muy corta. Debe tener al menos 8 caracteres.";
  }

  if (
    combined.includes("oobcode") ||
    combined.includes("expired-action-code") ||
    combined.includes("invalid-action-code") ||
    combined.includes("reset code")
  ) {
    return "El código o enlace de seguridad ya venció o fue utilizado. Por favor solicita uno nuevo.";
  }

  if (
    combined.includes("unauthenticated") ||
    combined.includes("auth/requires-recent-login") ||
    combined.includes("authenticated caller")
  ) {
    return "Tu sesión ha expirado por seguridad. Por favor vuelve a iniciar sesión.";
  }

  // 11. Permisos
  if (
    combined.includes("permission-denied") ||
    combined.includes("insufficient permissions") ||
    combined.includes("[403]")
  ) {
    return "No tienes permisos suficientes para realizar esta acción con tu perfil actual.";
  }

  // 12. Registro no encontrado
  if (
    combined.includes("not-found") ||
    combined.includes("does not exist") ||
    combined.includes("disappeared") ||
    combined.includes("[404]")
  ) {
    return "No encontramos el registro solicitado o fue actualizado recientemente. Refresca la pantalla e intenta de nuevo.";
  }

  // 13. Red / Conexión
  if (
    combined.includes("network-request-failed") ||
    combined.includes("failed to fetch") ||
    combined.includes("networkerror") ||
    combined.includes("deadline-exceeded") ||
    combined.includes("unavailable")
  ) {
    return "Hay un problema temporal con tu conexión a internet. Verifica tu red e intenta nuevamente en unos segundos.";
  }

  // 14. Limpiar mensajes que ya están en español pero contienen códigos técnicos (ej. CF-84, [400], etc.)
  const cleanedSpanish = rawMessage
    .replace(/\[4\d\d\]|\[5\d\d\]/g, "")
    .replace(/\((?:CF|LO|D)-\d+(?:\.\d+)?\)/gi, "")
    .replace(/Nothing was written\.?/gi, "")
    .replace(/Firebase:\s*Error\s*\([^)]+\)\.?/gi, "")
    .trim();

  const looksTechnicalOrEnglish =
    /requires|must be|nothing was written|httpserror|firebase|invalid-argument|failed-precondition|already-exists|undefined|null|uid|callable|collection|document|\[4\d\d\]|\[5\d\d\]/i.test(
      combined
    );

  if (!looksTechnicalOrEnglish && cleanedSpanish.length > 4) {
    return cleanedSpanish;
  }

  return fallbackMessage;
}

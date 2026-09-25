export function reportAppError(error: unknown, context: Record<string, unknown> = {}) {
  try {
    console.error("[ErrorReporting]", error, context);
  } catch (_) {}
}

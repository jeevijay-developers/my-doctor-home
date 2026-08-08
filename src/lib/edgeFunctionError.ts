// supabase.functions.invoke() only gives us an Error on non-2xx responses —
// the JSON body (where our edge functions put { error: "..." } or
// { message: "..." }) has to be read off the underlying Response via
// FunctionsHttpError.context. Shared so every edge-function call site can
// surface the actual backend reason instead of a generic fallback toast.
export const edgeFunctionErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
  try {
    const err = error as { context?: Response };
    if (err?.context && typeof err.context.json === "function") {
      const body = await err.context.json();
      if (body?.message) return String(body.message);
      if (body?.error) return String(body.error);
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
};

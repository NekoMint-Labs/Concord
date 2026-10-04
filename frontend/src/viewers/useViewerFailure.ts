import { useEffect, useRef } from "react";

/** C reports failures; B associates them with the mounted Evidence context. */
export function useViewerFailure(
  message: string,
  onError?: (message: string | null) => void,
) {
  const callback = useRef(onError);
  callback.current = onError;
  useEffect(() => {
    callback.current?.(message || null);
  }, [message, onError]);
}

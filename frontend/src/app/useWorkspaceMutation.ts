import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notify } from "../components/ui/AppToaster";

/** Serialize workspace mutations and reconcile the authoritative server state. */
export function useWorkspaceMutation() {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const mutationActive = useRef(false);
  const [error, setError] = useState("");
  /**
   * The single place an operation is reported to the user. A failure is always
   * announced - it is the one outcome a user cannot see coming - and a success
   * is announced only when the caller names what completed, because the durable
   * record of a successful operation is the workspace itself, not a toast.
   */
  async function perform(
    operation: () => Promise<unknown>,
    completed?: string,
  ) {
    if (mutationActive.current) return;
    mutationActive.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      await cache.invalidateQueries({ queryKey: ["workspace"] });
      await Promise.all(
        ["timeline", "runs", "documents", "bim", "job"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      if (completed) notify.success(completed);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "操作失败";
      setError(message);
      notify.error("操作未完成", message);
      await cache.invalidateQueries({ queryKey: ["workspace"] });
    } finally {
      mutationActive.current = false;
      setBusy(false);
    }
  }
  return { perform, busy, error, setError };
}

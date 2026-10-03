import type { Workspace } from "../api/client";

/** Rejection is an immutable server audit decision, not a frontend status flag. */
export function proposalRejected(
  workspace: Workspace,
  proposalId?: string | null,
) {
  return (
    !!proposalId &&
    workspace.audit.some(
      (record) =>
        record.action === "ACTION_PROPOSAL_REJECTED" &&
        record.detail.proposal_id === proposalId,
    )
  );
}

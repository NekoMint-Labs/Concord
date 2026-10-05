import { Manager } from "@thatopen/ui";
import "../../src/styles.css";
import { useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import type { DTO } from "../../src/api/client";

export interface EvidenceHostInput {
  project: string;
  evidence: DTO<"Evidence">;
  revisions: DTO<"ProjectSourceRevision">[];
}

declare global {
  interface Window {
    selectHostEvidence: (input: EvidenceHostInput) => void;
  }
}

function Harness({ Host }: { Host: ComponentType<EvidenceHostInput> }) {
  const [input, setInput] = useState<EvidenceHostInput>();
  window.selectHostEvidence = setInput;
  return (
    <main>
      <h1>Real Evidence host and engineering surfaces</h1>
      <button onClick={() => setInput(undefined)}>Close Evidence</button>
      {input && <Host {...input} />}
    </main>
  );
}

// Match the real B entry point before constructing its donor UI components.
Manager.init("", false);
const root = createRoot(document.getElementById("root")!);
// B owns this file. The separate qualification config requires its presence.
// Keep C runnable on its own, and load B's actual export in the combined tree.
const hostPath = "/src/app/EvidenceWorkspaceHost.tsx";
void import(/* @vite-ignore */ hostPath)
  .then(({ EvidenceWorkspaceHost }) => {
    if (typeof EvidenceWorkspaceHost !== "function")
      throw new Error("B's EvidenceWorkspaceHost export is unavailable");
    root.render(<Harness Host={EvidenceWorkspaceHost} />);
  })
  .catch((failure) => root.render(<p role="alert">{String(failure)}</p>));

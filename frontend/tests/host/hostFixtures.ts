import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import type { DTO } from "../../src/api/client";
import type { ExtractedDocument } from "../../src/viewers/document/documentTypes";
import type { EvidenceHostInput } from "./evidence-host";

export type Kind = "drawing" | "cad" | "bim" | "document";
const project = "golden-host";
const observed = "2026-10-05T00:00:00Z";
const filenames = {
  drawing: "R1/structural-drawing.pdf",
  cad: "R1/structural-drawing.dxf",
  bim: "R1/structure.ifc",
  document: "R1/coordination-log.xlsx",
};

export function hostFixture(kind: Kind) {
  const file = filenames[kind];
  const bytes = readFileSync(resolve("../fixtures/coordination-project", file));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const source = "golden-" + kind;
  const revision: DTO<"ProjectSourceRevision"> = {
    id: kind + "-r1",
    project_id: project,
    source_id: source,
    sequence: 1,
    external_label: "Golden R1",
    original_filename: file.split("/")[1],
    sha256: hash,
    media_type: null,
    size_bytes: bytes.length,
    storage_key: "qualification-only",
    import_status: "STORED",
    imported_at: observed,
  };
  let extraction: ExtractedDocument | undefined;
  const targets: Record<Kind, NonNullable<DTO<"Evidence">["viewer_target"]>> = {
    drawing: {
      kind: "drawing",
      source_revision_id: revision.id,
      page: 1,
      normalized_bbox: [0.1, 0.2, 0.4, 0.5],
    },
    cad: {
      kind: "cad",
      source_revision_id: revision.id,
      entity_id: "31",
      layer: "STRUCTURE",
      view_bounds: [0, 0, 4, 0.3],
    },
    bim: {
      kind: "bim",
      source_revision_id: revision.id,
      global_ids: ["3M0KwyPFrBT9KwklhqZa8W"],
      viewpoint: null,
    },
    document: {
      kind: "document",
      source_revision_id: revision.id,
      structural_path: ["Coordination", "row:4", "cell:C4"],
    },
  };
  if (kind === "document") {
    extraction = JSON.parse(
      readFileSync(
        resolve("../.verification-work/document-viewer/xlsx.json"),
        "utf8",
      ),
    );
    if (extraction!.sourceHash !== hash)
      throw new Error(
        "Docling qualification does not match the original Golden XLSX",
      );
    const chunk = extraction!.chunks.find(
      (item) => item.text === "Route moved; verify clearance",
    );
    if (!chunk) throw new Error("The real Golden coordination cell is absent");
    targets.document = {
      kind: "document",
      source_revision_id: revision.id,
      structural_path: ["Coordination", "row:4", "cell:C4"],
      page: chunk.page,
      location: chunk.location,
    };
  }
  const evidence: DTO<"Evidence"> = {
    id: "golden-evidence-" + kind,
    snapshot_id: "golden-host-snapshot",
    provider: kind === "document" ? "docling" : "engineering-qualification",
    source_id: source,
    source_revision_id: revision.id,
    source_revision: hash,
    observed_at: observed,
    element_ids: [],
    work_package_id: null,
    page: null,
    location: null,
    fact: "Golden " + kind + " target",
    quality: kind === "document" ? "extracted" : "structured",
    viewer_target: targets[kind],
  };
  return {
    bytes,
    revision,
    extraction,
    input: {
      project,
      evidence,
      revisions: [revision],
    } satisfies EvidenceHostInput,
  };
}
export type HostFixture = ReturnType<typeof hostFixture>;

/** Replace transport only. Host hashing/loaders and all engineering engines remain real. */
export async function hostTransport(
  page: Page,
  fixture: HostFixture,
  corrupt = false,
) {
  const paths: string[] = [];
  await page.route("http://127.0.0.1:15173/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    paths.push(path);
    const root = `/api/projects/${project}/sources/${fixture.revision.source_id}/revisions`;
    if (path === root) {
      // A newer revision exists. It must never replace the explicit Evidence target.
      return route.fulfill({
        json: [
          { ...fixture.revision, id: "unselected-r2", sequence: 2 },
          fixture.revision,
        ],
      });
    }
    if (path === root + `/${fixture.revision.id}/content`)
      return route.fulfill({
        body: corrupt ? Buffer.from("corrupt source") : fixture.bytes,
        contentType: "application/octet-stream",
      });
    if (path === `/api/projects/${project}/documents` && fixture.extraction)
      return route.fulfill({
        json: [
          {
            id: "golden-docling",
            project_id: project,
            filename: fixture.revision.original_filename,
            content_hash: fixture.revision.sha256,
            parser: "docling",
            created_at: observed,
          },
        ],
      });
    if (path === "/api/documents/golden-docling/chunks" && fixture.extraction)
      return route.fulfill({ json: fixture.extraction.chunks });
    return route.fulfill({
      status: 404,
      json: { detail: "Unexpected qualification API path: " + path },
    });
  });
  return paths;
}

export async function selectEvidence(page: Page, fixture: HostFixture) {
  await page.waitForFunction(
    () => typeof window.selectHostEvidence === "function",
  );
  await page.evaluate(
    (input) => window.selectHostEvidence(input),
    fixture.input,
  );
}

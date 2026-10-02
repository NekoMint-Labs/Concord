import type { ComponentProps, ReactNode } from "react";
import type {
  AgentRun,
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import type { BimMappingContext } from "../features/BimMappingWorkspace";
import type { ConcordContext } from "../features/ConcordAgent";
import type { WorkspaceInspectorView } from "../features/InvestigationInspector";
import type { WorkList } from "../features/WorkList";
import type { WorkspaceTab } from "./destinations";

/** Existing workspace inputs; ownership stays with App and feature controllers. */
export type WorkspaceViewsProps = {
  project: string;
  data: Workspace;
  modelSource?: ProjectSourceStatus;
  modelSources?: ProjectSourceStatus[];
  localIfcFile?: File | null;
  onLocalIfcFile?: (file: File | null) => void;
  selected: string;
  selectedConstraint: string;
  selectedElement: string;
  selectedSpatialIssue: string;
  onElementSelected: (id: string) => void;
  onSpatialIssueSelected: (id: string) => void;
  tab: WorkspaceTab;
  busy: boolean;
  detailsOpen: boolean;
  inspectorView: WorkspaceInspectorView;
  perform: (operation: () => Promise<unknown>) => Promise<void>;
  onTab: (tab: WorkspaceTab) => void;
  onSelected: (id: string) => void;
  onConstraint: (id: string) => void;
  onDetailsOpen: (open: boolean) => void;
  onInspectorView: (view: WorkspaceInspectorView) => void;
  onRecheck: () => void;
  onStructure: () => void;
  mappingMode?: boolean;
  mappingContext?: BimMappingContext;
  report?: InvestigationReport | null;
  run?: AgentRun | null;
  investigationContext: ConcordContext;
  onSourceContext: (
    sourceId: string,
    revisionId?: string,
    revisionLabel?: string,
    fromRevisionId?: string,
    fromRevisionLabel?: string,
  ) => void;
  onBimContext: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onAgentRun: (run: AgentRun) => void;
  onInvestigateSource: (
    sourceId: string,
    revisionId: string,
    fromRevisionId?: string,
    elementIds?: string[],
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onInvestigateBim: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
  ) => void;
  onInspectImpact: (workPackageId: string, context: BimMappingContext) => void;
  projectSourceId?: string;
  onProjectSourceSelected?: (id: string) => void;
  onLinkBim?: () => void;
  onInvestigateWorkPackage?: (id: string) => void;
  onInvestigateWork?: ComponentProps<typeof WorkList>["onInvestigate"];
  investigationProgress?: ReactNode;
  investigationError?: string;
  onRetryInvestigation?: () => void;
};

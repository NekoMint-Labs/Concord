export interface CadSource {
  name: string;
  revisionId: string;
  sourceHash: string;
  data: ArrayBuffer;
}
export const CAD_ENGINE =
  "mlightcad@250533a861e9fa1feca739b6783286ed4e91674a/data-model@1.15.1/concord-worker-v1";
export {
  verifyCadSource,
  validateCadTarget,
} from "../../../src/viewers/cad/cadValidation";
export type { CadNavigation } from "../../../src/viewers/cad/cadTypes";

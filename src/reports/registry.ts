import { composeGenericReport } from './generic_inspection/compose';
import { GenericInspectionRenderer } from './generic_inspection/Renderer';
import { composeElectricalReport } from './electrical_3000/compose';
import { ElectricalReport } from './electrical_3000/Renderer';

export const reportRegistry = {
  generic_inspection: {
    compose: composeGenericReport,
    Renderer: GenericInspectionRenderer,
  },
  electrical_3000: {
    compose: composeElectricalReport,
    Renderer: ElectricalReport,
  },
} as const;

export type RendererKey = keyof typeof reportRegistry;

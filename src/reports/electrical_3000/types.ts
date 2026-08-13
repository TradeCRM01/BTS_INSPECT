import type { OverallVerdict } from '../shared/inspectionCompose';
import type { NumberConfig, LayoutMode } from '../../types/template';
import type { PdfThemeTokens } from '../shared/styles';

export interface ElectricalAnswer {
  questionId?: string;
  label: string;
  type: string;
  value: unknown;
  required: boolean;
  yesNoLabels?: 'yes_no' | 'pass_fail';
  failOnNo?: boolean;
  allowNa?: boolean;
  numberConfig?: NumberConfig;
  numericStatus?: 'pass' | 'fail' | 'na' | 'unchecked';
  comment?: string;
  photos?: { url: string; caption?: string }[];
}

export interface ElectricalInstance {
  instanceId: string;
  label: string;
  answers: ElectricalAnswer[];
}

export interface ElectricalSection {
  id: string;
  title: string;
  description?: string;
  isRepeating: boolean;
  answers: ElectricalAnswer[];
  instances?: ElectricalInstance[];
}

export interface ElectricalSignature {
  label: string;
  signatureUrl?: string;
  name: string;
}

export interface ElectricalCountersign {
  roleLabel: string;
  name: string;
  signatureUrl?: string;
  date: string;
}

export interface ElectricalPhotoAppendixItem {
  sectionTitle: string;
  questionLabel: string;
  url: string;
  caption?: string;
}

export interface ElectricalCustomField {
  label: string;
  value: string;
}

export interface ElectricalDefect {
  sectionTitle: string;
  questionLabel: string;
  severity: 'critical' | 'major' | 'moderate';
  reason: string;
  measuredValue?: string;
  expected?: string;
  action?: string;
  photos: { url: string; caption?: string }[];
}

export interface ElectricalReportData {
  meta: {
    reportNumber: string;
    issueDate: string;
    site: string;
    siteAddress: string;
    client: string;
    jobNumber?: string;
    inspector: string;
    licenceNumber: string;
    dateOfTest: string;
  };
  customFields: ElectricalCustomField[];
  overallVerdict: OverallVerdict;
  overallVerdictLabel: string;
  layoutMode: LayoutMode;
  theme?: PdfThemeTokens;
  docVersion: number;
  amendmentReason?: string;
  sections: ElectricalSection[];
  defects: ElectricalDefect[];
  signatures: ElectricalSignature[];
  countersignatures: ElectricalCountersign[];
  photoAppendix: ElectricalPhotoAppendixItem[];
  company: {
    name: string;
    abn?: string;
    licenceNumber?: string;
    phone?: string;
    email?: string;
    website?: string;
    logoUrl?: string;
  };
}

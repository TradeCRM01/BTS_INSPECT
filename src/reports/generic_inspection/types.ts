import type { OverallVerdict } from '../shared/inspectionCompose';
import type { NumberConfig, LayoutMode } from '../../types/template';
import type { PdfThemeTokens } from '../shared/styles';

export interface GenericPhotoItem {
  url: string;
  caption?: string;
}

export interface GenericAnswer {
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
  photos?: GenericPhotoItem[];
}

export interface GenericInstance {
  instanceId: string;
  label: string;
  answers: GenericAnswer[];
}

export interface GenericSection {
  id: string;
  title: string;
  description?: string;
  isRepeating: boolean;
  answers: GenericAnswer[];
  instances?: GenericInstance[];
}

export interface GenericSignature {
  label: string;
  signatureUrl?: string;
  name: string;
}

export interface GenericCountersign {
  roleLabel: string;
  name: string;
  signatureUrl?: string;
  date: string;
}

export interface GenericPhotoAppendixItem {
  sectionTitle: string;
  questionLabel: string;
  url: string;
  caption?: string;
}

export interface GenericCustomField {
  label: string;
  value: string;
}

export interface GenericDefect {
  sectionTitle: string;
  questionLabel: string;
  severity: 'critical' | 'major' | 'moderate';
  reason: string;
  measuredValue?: string;
  expected?: string;
  action?: string;
  photos: { url: string; caption?: string }[];
}

export interface GenericReportData {
  reportNumber: string;
  issueDate: string;
  templateName: string;
  siteName?: string;
  siteAddress?: string;
  clientName?: string;
  jobNumber?: string;
  jobDescription?: string;
  customFields: GenericCustomField[];
  inspectorName: string;
  inspectorLicence?: string;
  companyName: string;
  companyAbn?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  overallVerdict: OverallVerdict;
  overallVerdictLabel: string;
  layoutMode: LayoutMode;
  theme?: PdfThemeTokens;
  docVersion: number;
  amendmentReason?: string;
  sections: GenericSection[];
  defects: GenericDefect[];
  signatures: GenericSignature[];
  countersignatures: GenericCountersign[];
  photoAppendix: GenericPhotoAppendixItem[];
  signatureUrl?: string;
  signoffDate: string;
}

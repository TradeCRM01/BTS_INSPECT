export interface JhaReportControl {
  hierarchy: string;
  text: string;
  owner: string;
  verify: string;
}

export interface JhaReportStep {
  description: string;
  hazards: string;
  consequence: string;
  likelihood: string;
  controls: string;
  controlMeasures: JhaReportControl[];
  initialRisk: { label: string; color: string; score?: number } | null;
  residualRisk: { label: string; color: string; score?: number } | null;
  residualLikelihood: string;
  residualConsequence: string;
  residualEscalationNote: string;
  inherentProduct: number | null;
  residualProduct: number | null;
  residualAboveThreshold: boolean;
  photos: Array<{ url: string; caption?: string }>;
}

export interface JhaReportSwms {
  enabled: boolean;
  hrcwLabels: string[];
  principalContractor: string;
  pcie: string;
  emergencyProcedures: string;
  highRiskNotes: string;
}

export interface JhaReportSignOff {
  roleLabel: string;
  name: string;
  signature: string | null;
  date: string;
}

export interface JhaReportCrewMember {
  name: string;
  role: string;
  date: string;
  signed: boolean;
  signature?: string | null;
}

export interface JhaReportLinkedSwms {
  id: string;
  title: string;
  filename: string;
}

export interface JhaReportEmergencyContact {
  name: string;
  phone: string;
  role: string;
}

export interface JhaReportCustomField {
  label: string;
  value: string;
}

export interface JhaReportPpeItem {
  label: string;
  standardRef?: string;
}

export interface JhaReportData {
  reportNumber: string;
  issueDate: string;
  templateName: string;
  taskName: string;
  siteName: string;
  date: string;
  supervisor: string;
  inspectorName: string;
  companyName: string;
  companyAbn?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  companyAddress?: string;
  siteContact?: string;
  clientName?: string;
  plantArea?: string;
  shift?: string;
  permitRefs?: string;
  musterPoint?: string;
  emergencyContacts: JhaReportEmergencyContact[];
  customFields: JhaReportCustomField[];
  crewSignOns: JhaReportCrewMember[];
  maxAcceptableResidualScore: number;
  docVersion: number;
  amendmentReason?: string;
  amendedFromReport?: string;
  packMode?: boolean;
  swms?: JhaReportSwms | null;
  linkedSwms: JhaReportLinkedSwms[];
  steps: JhaReportStep[];
  ppe: JhaReportPpeItem[];
  signOffs: JhaReportSignOff[];
  riskLevels: Array<{ id: string; label: string; color: string }>;
  riskScoreMap?: Record<string, number>;
}

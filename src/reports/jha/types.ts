export interface JhaReportStep {
  description: string;
  hazards: string;
  consequence: string;
  likelihood: string;
  controls: string;
  initialRisk: { label: string; color: string } | null;
  residualRisk: { label: string; color: string } | null;
}

export interface JhaReportSignOff {
  roleLabel: string;
  name: string;
  signature: string | null;
  date: string;
}

export interface JhaReportEmergencyContact {
  name: string;
  phone: string;
  role: string;
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
  emergencyContacts: JhaReportEmergencyContact[];
  steps: JhaReportStep[];
  ppe: string[];
  signOffs: JhaReportSignOff[];
  riskLevels: Array<{ id: string; label: string; color: string }>;
  riskScoreMap?: Record<string, number>;
}

export interface GenericPhotoItem {
  url: string;
  caption?: string;
}

export interface GenericAnswer {
  label: string;
  type: string;
  value: unknown;
  required: boolean;
  yesNoLabels?: 'yes_no' | 'pass_fail';
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

export interface GenericReportData {
  reportNumber: string;
  issueDate: string;
  templateName: string;
  siteName?: string;
  siteAddress?: string;
  clientName?: string;
  jobNumber?: string;
  inspectorName: string;
  companyName: string;
  companyAbn?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  sections: GenericSection[];
  signatureUrl?: string;
  signoffDate: string;
}

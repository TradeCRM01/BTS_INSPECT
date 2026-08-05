export interface ElectricalAnswer {
  label: string;
  type: string;
  value: unknown;
  required: boolean;
  yesNoLabels?: 'yes_no' | 'pass_fail';
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

export interface ElectricalReportData {
  meta: {
    reportNumber: string;
    issueDate: string;
    site: string;
    siteAddress: string;
    client: string;
    inspector: string;
    licenceNumber: string;
    dateOfTest: string;
  };
  sections: ElectricalSection[];
  company: {
    name: string;
    abn?: string;
    licenceNumber?: string;
    phone?: string;
    website?: string;
    logoUrl?: string;
  };
}

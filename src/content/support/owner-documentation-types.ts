export interface OwnerDocumentationLink {
  label: string;
  href: string;
}

export interface OwnerDocumentationTopic {
  title: string;
  body: string;
  steps?: string[];
  links?: OwnerDocumentationLink[];
}

export interface OwnerDocumentationSection {
  id: string;
  title: string;
  summary: string;
  topics: OwnerDocumentationTopic[];
  sources: string[];
}

export interface OwnerDocumentation {
  title: string;
  introduction: string;
  version: string;
  reviewedOn: string;
  sections: OwnerDocumentationSection[];
}

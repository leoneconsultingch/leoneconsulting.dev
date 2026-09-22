export interface CvLocalized {
  it: string;
  en: string;
}

export interface CvSkillArea {
  area: CvLocalized;
  items: string[];
}

export interface CvExperience {
  period: CvLocalized;
  role: CvLocalized;
  org: string;
  url?: string;
  highlights: CvLocalized[];
}

export interface CvProject {
  name: string;
  description: CvLocalized;
  tags: string[];
  url?: string;
}

export interface Cv {
  version: number;
  updated: string;
  name: string;
  role: CvLocalized;
  location: CvLocalized;
  summary: CvLocalized;
  contacts: {
    email: string;
    phone: string;
    website: string;
    github?: string;
    linkedin?: string;
  };
  stats: { value: string; label: CvLocalized }[];
  skills: CvSkillArea[];
  experience: CvExperience[];
  projects: CvProject[];
  languages: { name: CvLocalized; level: CvLocalized }[];
}

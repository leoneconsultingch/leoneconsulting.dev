export interface CaseStudy {
  slug: string;
  title: string;
  client: string;
  sector: string;
  published: boolean;
  order?: number;
  featuredImage?: string;
  
  problem: {
    description: string;
    painPoints: string[];
  };
  
  constraints: {
    timeline: string;
    budget: string;
    technical: string[];
    compliance?: string[];
  };
  
  solution: {
    architecture: string;
    keyDecisions: string[];
    approach: string;
  };
  
  results: {
    metrics: Array<{
      label: string;
      value: string;
      isProxy: boolean;
      description?: string;
    }>;
    impact: string;
  };
  
  tech: {
    stack: string[];
    tools: string[];
  };
  
  role: string[];
  
  links?: {
    demo?: string;
    repository?: string;
    screenshots?: string[];
  };
  
  metadata: {
    duration: string;
    year: number;
    language: 'it' | 'en';
  };
}

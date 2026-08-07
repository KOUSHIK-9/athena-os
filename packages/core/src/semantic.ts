export type SemanticSource = 'Accessibility' | 'Vision' | 'OCR';

export type SemanticRole =
  | 'button'
  | 'image'
  | 'label'
  | 'link'
  | 'navigation_bar'
  | 'page_indicator'
  | 'search_field'
  | 'slider'
  | 'switch'
  | 'tab'
  | 'tab_bar'
  | 'navigation'
  | 'text'
  | 'text_field'
  | 'scroll_view'
  | 'table'
  | 'cell'
  | 'dialog'
  | 'alert'
  | 'other';

export interface SemanticRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementConfidence {
  value: number;
  source: SemanticSource;
}

export interface SemanticElement {
  id: string;
  role: SemanticRole;
  type: string;
  label: string;
  value?: string;
  rect?: SemanticRect;
  enabled: boolean;
  visible: boolean;
  confidence: ElementConfidence;
  children: SemanticElement[];
  attributes?: Record<string, string | number | boolean>;
}

export interface SemanticSummary {
  elementCount: number;
  leafCount: number;
  interactiveCount: number;
  visibleCount: number;
  labeledCount: number;
  averageConfidence: number;
  labelCoverage: number;
}

export interface SemanticModel {
  score: number;
  capturedAt: string;
  root: SemanticElement;
  summary: SemanticSummary;
}

export type SemanticModelSnapshot = SemanticModel;

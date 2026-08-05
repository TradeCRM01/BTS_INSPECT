export type AnnotationTool = 'text' | 'highlight' | 'rectangle' | 'line' | 'circle' | 'whiteout';

export interface BaseAnnotation {
  id: string;
  type: AnnotationTool;
  pageNumber: number;
  x: number;
  y: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  width: number;
  height: number;
  text: string;
  fontSize: number;
  color: string;
}

export interface WhiteoutAnnotation extends BaseAnnotation {
  type: 'whiteout';
  width: number;
  height: number;
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  width: number;
  height: number;
  color: string;
}

export interface RectangleAnnotation extends BaseAnnotation {
  type: 'rectangle';
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
}

export interface LineAnnotation extends BaseAnnotation {
  type: 'line';
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}

export interface CircleAnnotation extends BaseAnnotation {
  type: 'circle';
  radiusX: number;
  radiusY: number;
  color: string;
  strokeWidth: number;
}

export type Annotation =
  | TextAnnotation
  | WhiteoutAnnotation
  | HighlightAnnotation
  | RectangleAnnotation
  | LineAnnotation
  | CircleAnnotation;

export const TOOL_COLORS = [
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#0A2540',
  '#000000',
];

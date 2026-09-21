export type CrudValue = string | number | boolean | null;
export type CrudRecord = Record<string, CrudValue>;
export interface CrudField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'url' | 'select';
  required?: boolean;
  immutable?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: string[];
  reference?: string;
  defaultValue?: CrudValue;
}
export interface CrudResource {
  name: string;
  label: string;
  description: string;
  keys: string[];
  fields: CrudField[];
}
export interface CrudPageResult {
  records: CrudRecord[];
  hasMore: boolean;
}
export interface CrudDeleteImpact {
  table: string;
  action: 'delete' | 'set-null' | 'blocked';
  count: number;
  examples: CrudRecord[];
}
export interface CrudDeletePreview {
  confirmation: string;
  allowed: boolean;
  impacts: CrudDeleteImpact[];
}
export interface CrudDeleteDependency {
  label: string;
  count: number;
}

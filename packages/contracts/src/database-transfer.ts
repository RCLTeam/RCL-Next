export interface DatabaseImportTable {
  table: string;
  currentRows: number;
  importedRows: number;
}
export interface DatabaseImportPreview {
  confirmation: string;
  exportedAt: string | null;
  tables: DatabaseImportTable[];
}
export interface DatabaseImportResult {
  importedAt: string;
}

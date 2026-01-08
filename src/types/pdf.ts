export interface TocEntry {
  title: string;
  page: number | null;
  children: TocEntry[];
}

export interface PdfInfo {
  title: string | null;
  author: string | null;
  creationDate: string | null;
  modDate: string | null;
  fileSize: number | null;
  pageCount: number | null;
  toc: TocEntry[];
}

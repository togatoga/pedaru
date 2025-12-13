export interface TocEntry {
  title: string;
  page: number | null;
  children: TocEntry[];
}

export interface PdfInfo {
  title: string | null;
  author: string | null;
  subject: string | null;
  toc: TocEntry[];
}

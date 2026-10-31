import type { ProductReportType, ProductReportStatus } from './product-report.validator';

export type ProductReportProductDto = {
  id: string;
  name: string;
  slug: string;
};

export type ProductReportStoreDto = {
  id: string;
  name: string;
};

export type ProductReportReporterDto = {
  id: string;
  displayName: string;
};

export type ProductReportDto = {
  id: string;
  type: ProductReportType;
  message: string;
  status: ProductReportStatus;
  createdAt: string;
  updatedAt: string;
  product: ProductReportProductDto;
  store: ProductReportStoreDto;
  reporter: ProductReportReporterDto;
  isMine: boolean;
};

export type ProductReportMinePayload = {
  report: ProductReportDto | null;
};

export type ProductReportListPayload = {
  reports: ProductReportDto[];
};

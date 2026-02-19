export interface BaseDocumentParams {
  space?: string;
  namespace?: string;
}

export interface AccountDocumentParams extends BaseDocumentParams {
  account?: {
    id: string;
    name: string;
  };
}

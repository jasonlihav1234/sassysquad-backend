export interface Order {
  order_id: string;
  order_name: string;
  buyer_id: string;
  seller_id: string;
  issue_date: Date;

  document_currency_code: string;
  pricing_currency_code: string;
  tax_currency_code: string | null;
  requested_invoice_currency_code: string;

  total_order_item_cost: Number;
  accounting_cost: Number | null;
  total_tax_cost: Number | null;
  payment_method_cost: Number;
  total_cost: Number;

  payment_method_code: string;
  destination_country_code: string;

  status: string;
  ubl_xml_content: string;
}

// For tests
export type InsertOrderOverrides = Partial<{
  order_id: string;
  order_name: string;
  buyer_id: string;
  seller_id: string;
  issue_date: Date;
  status: string | null;
  ubl_xml_content: string | null;
}>;

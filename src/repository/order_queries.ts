import pg from "../utils/db";

interface OrderItem {
  quantity: number;
  price_at_purchase: number;
  item_id: string;
}

// {
//   - order_name
//   - document_currency_code
//   - pricing_currency_code,
//   - tax_currency_code,
//   - requested_invoice_currency_code,
//   - payment_method_code,
//   - destination_country_code
//   - items: [
//     {
//       - quantity,
//       - price_at_purchase,
//       - item_id
//     }
//   ]
// }

export async function postOrder(
  order_name: string,
  buyer_id: string,
  seller_id: string,
  document_pricing_code: string,
  pricing_currency_code: string,
  tax_currency_code: string,
  requested_invoice_currency_code: string,
  payment_method_code: string,
  destination_country_code: string,
  items: OrderItem[],
  ubl_xml_content: string,
): Promise<boolean> {
  let total_order_item_cost: number = 0;
  let total_cost: number = 0;
  let total_tax_cost: number = 0; // gst
  let payment_method_cost: number = 0; // calculate surcharge
  const accounting_cost: number = 1.5;

  for (const item of items) {
    total_order_item_cost += item.price_at_purchase;
  }
  total_tax_cost = total_order_item_cost / 11;

  switch (payment_method_code) {
    case "visa":
      payment_method_cost = total_order_item_cost * (0.58 / 100);
      break;
    case "mastercard":
      payment_method_cost = total_order_item_cost * (0.5 / 100);
      break;
  }

  total_cost =
    total_order_item_cost +
    total_tax_cost +
    payment_method_cost +
    accounting_cost;
  // change the status later
  const query = await pg`
    insert into orders (order_id, 
                        order_name, 
                        buyer_id, 
                        seller_id, 
                        issue_date, 
                        document_currency_code,
                        pricing_currency_code,
                        tax_currency_code,
                        requested_invoice_currency_code,
                        total_order_item_cost,
                        accounting_cost,
                        total_tax_cost,
                        payment_method_cost,
                        total_cost,
                        payment_method_code,
                        destination_country_code,
                        status,
                        ubl_xml_content                       
    values (
      ${crypto.randomUUID()},
      ${order_name},
      ${buyer_id},
      ${seller_id},
      ${new Date()},
      ${document_pricing_code},
      ${pricing_currency_code},
      ${tax_currency_code},
      ${requested_invoice_currency_code},
      ${total_order_item_cost},
      ${accounting_cost},
      ${total_tax_cost},
      ${payment_method_cost},
      ${total_cost},
      ${payment_method_code},
      ${destination_country_code},
      ${"Paid"},
      ${ubl_xml_content}
    )
  )`;

  if (!query) {
    return false;
  }

  return true;
}

// export async function postOrderLines(): boolean {}

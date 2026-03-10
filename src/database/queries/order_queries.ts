import { jsonHelper } from "../../utils/jwt_helpers";
import pg from "../../utils/db";

interface Item {
  quantity: number;
  priceAtPurchase: number;
  itemId: string;
}

/**
 * Fetches an orderID based on its name, make sure to prepend await since these are async functions
 */
export async function getOrderIdByName(
  orderName: string,
): Promise<string | null> {
  const result = await pg`
    SELECT order_id 
    FROM orders 
    WHERE order_name = ${orderName}
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0].id;
}

/**
 * Creates an order in the database, make sure to prepend await since these are async functions
 * items should follow - [
 *  {
 *    quantity,
 *    price_at_purchase,
 *    item_id,
 *    tax_percent_per
 *  }
 * ]
 */
export async function createOrderQuery(
  orderName: string,
  buyerId: string,
  sellerId: string,
  documentCurrencyCode: string,
  pricingCurrencyCode: string,
  taxCurrencyCode: string,
  requestedInvoiceCurrencyCode: string,
  accountingCost: number,
  paymentMethodCode: string,
  destinationCountryCode: string,
  ublXMLContent: string,
  items: Array<Item>,
) {
  /**
   * order id - make this
   * order name - need this
   * buyer id - need this
   * seller id - need this
   * issue_date - make this
   * document currency code - need this
   * pricing currency code - need this
   * tax currency code - need this
   * requested invoice currency code - need this
   * total order item cost - make this
   * accounting cost - need this
   * total tax cost - make this
   * payment method cost - make this
   * total cost - make this
   * payment method code - need this
   * destination country code - need this
   * status - make this
   * ubl xml content - need this
   */
  const orderId = crypto.randomUUID();
  const totalItemCost = items.reduce((sum, item) => {
    return sum + item.quantity * item.priceAtPurchase;
  }, 0);

  const totalTaxCost = totalItemCost / 11; // GST

  let paymentMethodCost = 0;
  switch (paymentMethodCode.toLowerCase()) {
    case "visa":
      paymentMethodCost = totalItemCost * (0.58 / 100);
      break;
    case "mastercard":
      paymentMethodCost = totalItemCost * (0.5 / 100);
      break;
    default:
      paymentMethodCost = totalItemCost * (1.4 / 100);
      break;
  }

  const totalCost =
    totalItemCost + totalTaxCost + paymentMethodCost + accountingCost;
  const status = "pending";
  try {
    await pg`
      insert into orders (
        order_id, order_name, buyer_id, seller_id, issue_date, 
        document_currency_code, pricing_currency_code, tax_currency_code,
        requested_invoice_currency_code, total_order_item_cost, accounting_cost, 
        total_tax_cost, payment_method_cost, total_cost, payment_method_code, 
        destination_country_code, status, ubl_xml_content
      ) values (
        ${orderId}, ${orderName}, ${buyerId}, ${sellerId}, ${new Date().toISOString()}, 
        ${documentCurrencyCode}, ${pricingCurrencyCode}, ${taxCurrencyCode},
        ${requestedInvoiceCurrencyCode}, ${totalItemCost}, ${accountingCost}, 
        ${totalTaxCost}, ${paymentMethodCost}, ${totalCost}, ${paymentMethodCode}, 
        ${destinationCountryCode}, ${status}, ${ublXMLContent}
      )
    `;

    await Promise.all(
      items.map((item) =>
        createOrderlineQuery(
          orderId,
          item.itemId,
          item.quantity,
          0,
          item.priceAtPurchase,
        ),
      ),
    );

    return jsonHelper({
      message: "Insertion successful",
      orderId: orderId,
    });
  } catch (error) {
    console.error("Order Creation Failed:", error);
    return jsonHelper(
      {
        error: error,
        error_msg: "Insertion failed",
      },
      500,
    );
  }
}

/** Creates an order line, make sure to prepend await since these are async functions
 * line_id - make this
 * order_id - need
 * item_id - need
 * quantity - need
 * tax_percent_per - need (why do we need this? this is assuming that tax is cumulative no?)
 * tax_percent_total - calculate (prod just simulate gst for now)
 * price_at_purchase - need
 */
export async function createOrderlineQuery(
  orderId: string,
  itemId: string,
  quantity: number,
  taxPercentPer: number = 0,
  priceAtPurchase: number,
) {
  const lineId = crypto.randomUUID();
  // make tax percent total gst
  // return the total price of the items

  const totalItemPrice = priceAtPurchase * quantity;

  try {
    await pg`
    insert into order_lines (line_id, order_id, item_id, quantity, tax_percent_per, tax_percent_total, price_at_purchase)
    values (${lineId}, ${orderId}, ${itemId}, ${quantity}, 0, 10, ${priceAtPurchase})
    `;

    return totalItemPrice;
  } catch (error) {
    console.log(error);
    return null;
  }
}

/**
 * Obtaining all orders given a user ID, make sure to prepend await since these are async functions
 */

export async function getOrdersByUserId(userId: string) {
  try {
    const response = await pg`select * from users where user_id = ${userId}`;
    return response;
  } catch (error) {
    console.log(error);
    return null;
  }
}

/**
 * Deleting an order by given a order id, make sure to prepend await since these are async functions
 */

export async function deleteOrdersById(orderId: string) {
  try {
    await pg`delete from orders where order_id = ${orderId}`;

    return jsonHelper({ message: "Order deleted" });
  } catch (error) {
    return jsonHelper(
      {
        error: error,
        message: "Order deletion failed",
      },
      500,
    );
  }
}

/**
 * Updating an order, make sure to prepend await since these are async functions, think about deleting an item - it can't be done if there are open orders for it
 * for the items - have to always provide every item in an order, even if you are not adding or removing an item
 * please provide the previous values of the order if they are not changed
 */
export async function updateOrdersById(
  orderId: string,
  orderName: string,
  buyerId: string,
  sellerId: string,
  documentCurrencyCode: string,
  pricingCurrencyCode: string,
  taxCurrencyCode: string,
  requestedInvoiceCurrencyCode: string,
  accountingCost: number,
  paymentMethodCode: string,
  destinationCountryCode: string,
  status: string,
  ublXMLContent: string,
  items: Array<Item>,
) {
  const valuesToUpsert = await Promise.all(
    items.map((item) => ({
      line_id: crypto.randomUUID(),
      order_id: orderId,
      item_id: item.itemId,
      quantity: item.quantity,
      price_at_purchase: item.priceAtPurchase,
      tax_percent_per: 0,
      tax_percent_total: 10,
    })),
  );

  await pg`
  insert into order_lines ${pg(valuesToUpsert)}
  on conflict (order_id, item_id)
  do update set
    quantity = excluded.quantity
  `;

  const totalItemCost = items.reduce(
    (sum, item) => sum + (item.quantity + item.priceAtPurchase),
    0,
  );

  const totalTaxCost = totalItemCost / 11; // GST
  let paymentMethodCost = 0;

  switch (paymentMethodCode.toLowerCase()) {
    case "visa":
      paymentMethodCost = totalItemCost * (0.58 / 100); // 0.58 for visa and 0.5 for mastercard
      break;
    case "mastercard":
      paymentMethodCost = totalItemCost * (0.5 / 100);
      break;
    default:
      paymentMethodCost = totalItemCost * (1.4 / 100); // 1.4% default
      break;
  }

  const totalCost =
    totalItemCost + totalTaxCost + paymentMethodCost + accountingCost;
  const newStatus = status; // maybe use stripe for changing this status?
  console.log(totalCost, orderId);

  try {
    await pg`
    update orders
    set
      order_name = ${orderName},
      buyer_id = ${buyerId},
      seller_id = ${sellerId},
      document_currency_code = ${documentCurrencyCode},
      pricing_currency_code = ${pricingCurrencyCode},
      tax_currency_code = ${taxCurrencyCode},
      requested_invoice_currency_code = ${requestedInvoiceCurrencyCode},
      total_order_item_cost = ${totalItemCost},
      accounting_cost = ${accountingCost},
      total_tax_cost = ${totalTaxCost},
      payment_method_cost = ${paymentMethodCost},
      total_cost = ${totalCost},
      payment_method_code = ${paymentMethodCode},
      destination_country_code = ${destinationCountryCode},
      status = ${newStatus},
      ubl_xml_content = ${ublXMLContent}
    where
      order_id = ${orderId}
    `;

    return jsonHelper({
      message: "Update successful",
    });
  } catch (error) {
    return jsonHelper(
      {
        error: error,
        error_msg: "Update failed",
      },
      500,
    );
  }
}

import { jsonHelper } from "../../utils/jwt_helpers";
import pg from "../../utils/db";

interface Item {
  quantity: number;
  priceAtPurchase: number;
  itemId: string;
}

interface OrderLineUpdate {
  item_id: string;
  quantity: number;
}

/**
 * Fetches an orderID based on its name, make sure to prepend await since these are async functions
 */
export async function getOrderIdByName(
  orderName: string
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
 * Fetches an order based on its ID, make sure to prepend await since these are async functions
 */
export async function getOrderById(
  orderId: string
) {
  const result = await pg`
    SELECT *
    FROM orders 
    WHERE order_id = ${orderId}
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0];
}

/**
 * Creates an order in the database, make sure to prepend await since these are async functions
 * items should follow - [
 *  {
 *    quantity,
 *    priceAtPurchase,
 *    itemId,
 *    taxPercentPer
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
  items: Array<Item>
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
    await pg.begin(async (sql) => {
      // 2. Sort items by ID to prevent database deadlocks on concurrent orders
      const sortedItems = [...items].sort((a, b) =>
        a.itemId.localeCompare(b.itemId)
      );

      for (const item of sortedItems) {
        const updateResult = await pg`
          update items
          set quantity_available = quantity_available - ${item.quantity}
          where item_id = ${item.itemId} 
            and quantity_available >= ${item.quantity}
          returning item_id, quantity_available
        `;

        if (updateResult.length === 0) {
          throw new Error(`Insufficient inventory for item ID: ${item.itemId}`);
        }
      }

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

      const orderLinesToInsert = items.map((item) => ({
        line_id: crypto.randomUUID(),
        order_id: orderId,
        item_id: item.itemId,
        quantity: item.quantity,
        tax_percent_per: 0,
        tax_percent_total: 10,
        price_at_purchase: item.priceAtPurchase,
      }));

      const res = await pg`
        insert into order_lines ${sql(orderLinesToInsert)}
      `;
    });

    return jsonHelper({
      message: "Insertion successful",
      orderId: orderId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Insufficient inventory")
    ) {
      return jsonHelper({ error_msg: error.message }, 400);
    }

    return jsonHelper(
      {
        error: error,
        error_msg: "Insertion failed",
      },
      500
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
  priceAtPurchase: number
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
      500
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
  items: Array<Item>
) {
  try {
    // 1. Start a database transaction
    return await pg.begin(async (sql) => {
      // 2. Fetch the current quantities for this order to calculate the difference
      const existingLines = await pg<OrderLineUpdate[]>`
        select item_id, quantity 
        from order_lines 
        where order_id = ${orderId}
      `;

      const existingQuantityMap = new Map(
        existingLines.map((line) => [line.item_id, line.quantity])
      );

      const sortedItems = [...items].sort((a, b) =>
        a.itemId.localeCompare(b.itemId)
      );

      for (const item of sortedItems) {
        const oldQuantity = existingQuantityMap.get(item.itemId) || 0;
        const difference = item.quantity - oldQuantity;

        if (difference > 0) {
          const updateResult = await pg`
            update items
            set quantity_available = quantity_available - ${difference}
            where item_id = ${item.itemId} 
              and quantity_available >= ${difference}
            returning item_id
          `;

          if (updateResult.length === 0) {
            throw new Error("Not enough quantity");
          }
        } else if (difference < 0) {
          const amountToReturn = Math.abs(difference);
          await pg`
            update items
            set quantity_available = quantity_available + ${amountToReturn}
            where item_id = ${item.itemId}
          `;
        }
      }

      if (items.length > 0) {
        const valuesToUpsert = items.map((item) => ({
          line_id: crypto.randomUUID(),
          order_id: orderId,
          item_id: item.itemId,
          quantity: item.quantity,
          price_at_purchase: item.priceAtPurchase,
          tax_percent_per: 0,
          tax_percent_total: 10,
        }));

        await pg`
          insert into order_lines ${sql(valuesToUpsert)}
          on conflict (order_id, item_id)
          do update set
            quantity = excluded.quantity,
            price_at_purchase = excluded.price_at_purchase
        `;
      }

      const totalItemCost = items.reduce(
        (sum, item) => sum + item.quantity * item.priceAtPurchase,
        0
      );

      const totalTaxCost = totalItemCost / 11;
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

      // 7. Update Orders Table
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
          status = ${status},
          ubl_xml_content = ${ublXMLContent}
        where
          order_id = ${orderId}
      `;

      return jsonHelper({
        message: "Update successful",
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Not enough quantity") {
      return jsonHelper({ error: error.message }, 400);
    }

    return jsonHelper(
      {
        error: error,
        error_msg: "Update failed",
      },
      500
    );
  }
}

/**
 * Creates an item, make sure to prepend await since these are async functions
 *
 */
export async function createItem(
  seller_id: string,
  item_name: string,
  description: string | null,
  price: number,
  quantity_available: number,
  image_url: string | null
) {
  try {
    await pg`
    insert into items
    (item_id, seller_id, item_name, description, price, quantity_available, image_url, created_at, last_updated)
    values
    (${crypto.randomUUID()}, ${seller_id}, ${item_name}, ${description}, ${price}, ${quantity_available}, ${image_url}, ${new Date()}, ${new Date()})
    `;

    return jsonHelper({
      message: "Order created",
    });
  } catch (error) {
    return jsonHelper(
      {
        error: "Order failed to create",
      },
      500
    );
  }
}

/**
 * Edits an item, make sure to prepend await since these are async functions
 */
export async function editItem(
  item_id: string,
  seller_id: string | null,
  item_name: string | null,
  description: string | null,
  price: number | null,
  quantity_available: number | null,
  image_url: string | null
) {
  const data = {
    seller_id,
    item_name,
    description,
    price,
    quantity_available,
    image_url,
  };

  // remove all values that are null
  const updateData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== null)
  );

  if (Object.keys(updateData).length === 0) {
    return jsonHelper({
      message: "No values to update for items",
    });
  }

  try {
    await pg`
    update items
    set ${pg(updateData)}
    where item_id = ${item_id}
    `;

    return jsonHelper({
      message: "Item successfully updated",
    });
  } catch (error) {
    return jsonHelper(
      {
        error: error,
        message: "Item update failed",
      },
      500
    );
  }
}

/**
 * Deletes an item given an id
 */
export async function deleteItem(itemId: string) {
  if (!itemId) {
    return jsonHelper(
      {
        error: "No itemId provided",
      },
      400
    );
  }

  try {
    await pg`
    delete from items
    where item_id = ${itemId}
    `;

    return jsonHelper({ message: "Item deleted" });
  } catch (error) {
    return jsonHelper(
      {
        error: error,
        message: "Item failed to delete",
      },
      500
    );
  }
}

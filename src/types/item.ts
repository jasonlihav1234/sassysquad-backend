export type InsertItemOverrides = Partial<{
    item_id: string;
    item_name: string;
    description: string | null;
    price: number;
    quantity_available: number;
    image_url: string | null;
  }> & { seller_id: string };
DROP TABLE IF EXISTS item_tags CASCADE;
DROP TABLE IF EXISTS order_lines CASCADE;

DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- User & Auth Management
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    user_name VARCHAR(255), 
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  category_id UUID PRIMARY KEY,
  category_name TEXT UNIQUE NOT NULL
);

CREATE TABLE tags (
  tag_id UUID PRIMARY KEY,
  tag_name TEXT UNIQUE NOT NULL
);

-- Seller Inventory
CREATE TABLE items (
    item_id UUID PRIMARY KEY,
    seller_id UUID REFERENCES users(user_id),
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL NOT NULL CHECK (price >= 0),
    quantity_available INT NOT NULL CHECK (quantity_available >= 0),
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    category_id UUID REFERENCES categories(category_id)
);

-- Order Headers
CREATE TABLE orders (
    order_id UUID PRIMARY KEY,
    order_name VARCHAR(255), 
    buyer_id UUID REFERENCES users(user_id),
    seller_id UUID REFERENCES users(user_id),
    issue_date DATE NOT NULL,
    
    -- Currency
    document_currency_code VARCHAR(3), 
    pricing_currency_code VARCHAR(3),
    tax_currency_code VARCHAR(3),
    requested_invoice_currency_code VARCHAR(3),
    
    -- Costs
    total_order_item_cost DECIMAL, 
    accounting_cost DECIMAL, 
    total_tax_cost DECIMAL,
    payment_method_cost DECIMAL, 
    total_cost DECIMAL,
    
    -- Payment
    payment_method_code VARCHAR(255), 
    destination_country_code VARCHAR(3), 
    
    status VARCHAR(50), 
    ubl_xml_content TEXT,

    CONSTRAINT buyer_seller_unique CHECK (buyer_id <> seller_id)
);

-- Order Lines 
CREATE TABLE order_lines (
    line_id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(order_id),
    item_id UUID REFERENCES items(item_id) ON DELETE SET NULL,
    quantity INT NOT NULL,
    tax_percent_per DECIMAL NOT NULL,
    tax_percent_total DECIMAL NOT NULL,
    price_at_purchase DECIMAL NOT NULL,
    CONSTRAINT order_item UNIQUE (order_id, item_id)
);

CREATE TABLE refresh_tokens (
  token_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires DATE NOT NULL,
  revoked BOOLEAN NOT NULL,
  device_info TEXT,
  created DATE NOT NULL,
  session_id UUID NOT NULL
);

CREATE TABLE item_tags (
  tag_id UUID REFERENCES tags(tag_id),
  item_id UUID REFERENCES items(item_id),
  PRIMARY KEY (tag_id, item_id)
);

INSERT INTO tags (tag_id, tag_name) VALUES
  (gen_random_uuid(), 'boucle'),
  (gen_random_uuid(), 'linen'),
  (gen_random_uuid(), 'travertine'),
  (gen_random_uuid(), 'marble'),
  (gen_random_uuid(), 'walnut'),
  (gen_random_uuid(), 'white-oak'),
  (gen_random_uuid(), 'brushed-metal'),
  (gen_random_uuid(), 'concrete'),
  (gen_random_uuid(), 'warm-neutral'),
  (gen_random_uuid(), 'cool-neutral'),
  (gen_random_uuid(), 'earth-tone'),
  (gen_random_uuid(), 'monochromatic'),
  (gen_random_uuid(), 'charcoal'),
  (gen_random_uuid(), 'low-profile'),
  (gen_random_uuid(), 'sculptural'),
  (gen_random_uuid(), 'geometric'),
  (gen_random_uuid(), 'chunky'),
  (gen_random_uuid(), 'wabi-sabi'),
  (gen_random_uuid(), 'japandi'),
  (gen_random_uuid(), 'brutalist'),
  (gen_random_uuid(), 'soft-minimalism'),
  (gen_random_uuid(), 'shearling'),
  (gen_random_uuid(), 'smoked-glass'),
  (gen_random_uuid(), 'fluted'),
  (gen_random_uuid(), 'burl-wood'),
  (gen_random_uuid(), 'rattan'),
  (gen_random_uuid(), 'plaster'),
  (gen_random_uuid(), 'alabaster'),
  (gen_random_uuid(), 'onyx'),
  (gen_random_uuid(), 'taupe'),
  (gen_random_uuid(), 'rust'),
  (gen_random_uuid(), 'muted-sage'),
  (gen_random_uuid(), 'modular'),
  (gen_random_uuid(), 'floating'),
  (gen_random_uuid(), 'cantilever'),
  (gen_random_uuid(), 'pedestal'),
  (gen_random_uuid(), 'asymmetrical')
ON CONFLICT (tag_name) DO NOTHING;

INSERT INTO categories (category_id, category_name) VALUES
  (gen_random_uuid(), 'sofa'),
  (gen_random_uuid(), 'accent-chair'),
  (gen_random_uuid(), 'lounge-chair'),
  (gen_random_uuid(), 'ottoman'),
  (gen_random_uuid(), 'bench'),
  (gen_random_uuid(), 'coffee-table'),
  (gen_random_uuid(), 'side-table'),
  (gen_random_uuid(), 'console-table'),
  (gen_random_uuid(), 'dining-table'),
  (gen_random_uuid(), 'credenza'),
  (gen_random_uuid(), 'media-console'),
  (gen_random_uuid(), 'bookshelf'),
  (gen_random_uuid(), 'display-cabinet'),
  (gen_random_uuid(), 'floor-lamp'),
  (gen_random_uuid(), 'table-lamp'),
  (gen_random_uuid(), 'pendant-light'),
  (gen_random_uuid(), 'sconce'),
  (gen_random_uuid(), 'area-rug'),
  (gen_random_uuid(), 'floor-mirror'),
  (gen_random_uuid(), 'planter'),
  (gen_random_uuid(), 'sculpture')
ON CONFLICT (category_name) DO NOTHING;

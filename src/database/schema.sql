DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS order_lines CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

-- User & Auth Management
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    user_name VARCHAR(255) UNIQUE, 
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seller Inventory
CREATE TABLE items (
    item_id UUID PRIMARY KEY,
    seller_id UUID REFERENCES users(user_id),
    item_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL NOT NULL,
    quantity_available INT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order Headers
CREATE TABLE orders (
    order_id UUID PRIMARY KEY,
    order_name VARCHAR(255) UNIQUE, 
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
    ubl_xml_content TEXT
);

-- Order Lines 
CREATE TABLE order_lines (
    line_id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(order_id),
    item_id UUID REFERENCES items(item_id),
    quantity INT NOT NULL,
    tax_percent_per DECIMAL NOT NULL,
    tax_percent_total DECIMAL NOT NULL,
    price_at_purchase DECIMAL NOT NULL,
    CONSTRAINT order_item UNIQUE (order_id, item_id)
);

CREATE TABLE refresh_tokens (
  token_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires DATE NOT NULL,
  revoked BOOLEAN NOT NULL,
  device_info TEXT,
  created DATE NOT NULL,
  session_id UUID NOT NULL
);

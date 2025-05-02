-- filepath: d:\Techjays\AI-DB_Analyzer\sql_files\oracle_dump.sql
-- Oracle Database Dump with e-commerce schema

-- Create Users table
CREATE TABLE users (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR2(50) NOT NULL,
  email VARCHAR2(100) NOT NULL,
  password_hash VARCHAR2(255) NOT NULL,
  first_name VARCHAR2(50),
  last_name VARCHAR2(50),
  is_active NUMBER(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraints to users table
ALTER TABLE users ADD CONSTRAINT uk_users_username UNIQUE (username);
ALTER TABLE users ADD CONSTRAINT uk_users_email UNIQUE (email);

-- Create User Roles table
CREATE TABLE roles (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR2(50) NOT NULL,
  description CLOB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint to roles table
ALTER TABLE roles ADD CONSTRAINT uk_roles_name UNIQUE (name);

-- Create User-Role junction table
CREATE TABLE user_roles (
  user_id NUMBER NOT NULL,
  role_id NUMBER NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_roles FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Create indexes on user_roles
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- Create Categories table
CREATE TABLE categories (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR2(100) NOT NULL,
  slug VARCHAR2(100) NOT NULL,
  description CLOB,
  parent_id NUMBER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Add unique constraint to categories table
ALTER TABLE categories ADD CONSTRAINT uk_categories_slug UNIQUE (slug);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- Create Products table
CREATE TABLE products (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR2(255) NOT NULL,
  slug VARCHAR2(255) NOT NULL,
  description CLOB,
  price NUMBER(10,2) NOT NULL,
  stock_quantity NUMBER(11) DEFAULT 0 NOT NULL,
  category_id NUMBER NOT NULL,
  created_by NUMBER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_prod_users FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Add unique constraint and indexes to products table
ALTER TABLE products ADD CONSTRAINT uk_products_slug UNIQUE (slug);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_created_by ON products(created_by);

-- Create Product Tags table
CREATE TABLE tags (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR2(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint to tags table
ALTER TABLE tags ADD CONSTRAINT uk_tags_name UNIQUE (name);

-- Create Product-Tag junction table
CREATE TABLE product_tags (
  product_id NUMBER NOT NULL,
  tag_id NUMBER NOT NULL,
  CONSTRAINT pk_product_tags PRIMARY KEY (product_id, tag_id),
  CONSTRAINT fk_pt_products FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tags FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Create indexes on product_tags
CREATE INDEX idx_product_tags_tag ON product_tags(tag_id);

-- Create Orders table
CREATE TABLE orders (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id NUMBER NOT NULL,
  status VARCHAR2(20) DEFAULT 'pending' NOT NULL,
  shipping_address CLOB NOT NULL,
  billing_address CLOB NOT NULL,
  total_amount NUMBER(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_orders_status CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled'))
);

-- Create indexes on orders
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Create Order Items table
CREATE TABLE order_items (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id NUMBER NOT NULL,
  product_id NUMBER NOT NULL,
  quantity NUMBER(11) NOT NULL,
  price_per_unit NUMBER(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oi_orders FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_products FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_oi_quantity CHECK (quantity > 0)
);

-- Create indexes on order_items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Create Product Reviews table
CREATE TABLE product_reviews (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id NUMBER NOT NULL,
  user_id NUMBER NOT NULL,
  rating NUMBER(1) NOT NULL,
  review_text CLOB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_products FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_pr_rating CHECK (rating BETWEEN 1 AND 5)
);

-- Add unique constraint and indexes to product_reviews
ALTER TABLE product_reviews ADD CONSTRAINT uk_prod_reviews UNIQUE (product_id, user_id);
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX idx_product_reviews_user ON product_reviews(user_id);

-- Create Order Status History table
CREATE TABLE order_status_history (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id NUMBER NOT NULL,
  old_status VARCHAR2(20),
  new_status VARCHAR2(20) NOT NULL,
  comment CLOB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_osh_orders FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT ck_osh_old_status CHECK (old_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  CONSTRAINT ck_osh_new_status CHECK (new_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled'))
);

-- Create index on order_status_history
CREATE INDEX idx_osh_order ON order_status_history(order_id);

-- Insert sample data

-- Roles
INSERT INTO roles (name, description) VALUES ('admin', 'Administrator with full access');
INSERT INTO roles (name, description) VALUES ('manager', 'Can manage products and orders');
INSERT INTO roles (name, description) VALUES ('customer', 'Regular customer');

-- Users
INSERT INTO users (username, email, password_hash, first_name, last_name) 
VALUES ('admin_user', 'admin@example.com', '$2a$12$KNxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'Admin', 'User');

INSERT INTO users (username, email, password_hash, first_name, last_name) 
VALUES ('john_doe', 'john@example.com', '$2a$12$5KxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'John', 'Doe');

INSERT INTO users (username, email, password_hash, first_name, last_name) 
VALUES ('jane_smith', 'jane@example.com', '$2a$12$9JxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'Jane', 'Smith');

-- User Roles (must use sequence values since we added identity columns)
INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE u.username = 'admin_user' AND r.name = 'admin';
INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE u.username = 'john_doe' AND r.name = 'customer';
INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE u.username = 'jane_smith' AND r.name = 'manager';

-- Create view for product details
CREATE OR REPLACE VIEW product_details AS
SELECT 
  p.id, 
  p.name, 
  p.description, 
  p.price, 
  p.stock_quantity, 
  c.name AS category_name,
  u.username AS created_by_username
FROM products p
JOIN categories c ON p.category_id = c.id
LEFT JOIN users u ON p.created_by = u.id;

-- Create function to get product stock status
CREATE OR REPLACE FUNCTION get_stock_status(stock NUMBER) 
RETURN VARCHAR2
IS
  status VARCHAR2(20);
BEGIN
  IF stock = 0 THEN
    status := 'Out of stock';
  ELSIF stock < 10 THEN
    status := 'Low stock';
  ELSE
    status := 'In stock';
  END IF;
    
  RETURN status;
END;
/

-- Create procedure to get user's orders
CREATE OR REPLACE PROCEDURE get_user_orders(user_id_param IN NUMBER)
IS
BEGIN
  -- We use this cursor for returning data
  FOR ord_rec IN (
      SELECT o.id, o.status, o.total_amount, o.created_at,
             oi.product_id, p.name as product_name, oi.quantity, oi.price_per_unit
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.user_id = user_id_param
      ORDER BY o.created_at DESC
  ) LOOP
    -- In practice, you would handle these records or use a ref cursor
    DBMS_OUTPUT.PUT_LINE('Order ID: ' || ord_rec.id);
  END LOOP;
END;
/

-- Create procedure to update product stock
CREATE OR REPLACE PROCEDURE update_product_stock(
  product_id_param IN NUMBER,
  new_quantity IN NUMBER
)
IS
BEGIN
  UPDATE products
  SET stock_quantity = new_quantity,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = product_id_param;
  
  -- Log the stock update
  DBMS_OUTPUT.PUT_LINE('Stock updated for product ' || product_id_param || ' to ' || new_quantity);
END;
/

-- Create view for product inventory status
CREATE OR REPLACE VIEW product_inventory AS
SELECT 
  p.id,
  p.name,
  p.stock_quantity,
  get_stock_status(p.stock_quantity) AS stock_status
FROM products p;

-- Create trigger for order status updates
CREATE OR REPLACE TRIGGER trg_order_status_updated
AFTER UPDATE OF status ON orders
FOR EACH ROW
BEGIN
  IF :NEW.status != :OLD.status THEN
    INSERT INTO order_status_history (order_id, old_status, new_status, updated_at)
    VALUES (:NEW.id, :OLD.status, :NEW.status, CURRENT_TIMESTAMP);
  END IF;
END;
/
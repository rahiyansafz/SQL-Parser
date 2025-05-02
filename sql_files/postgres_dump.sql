-- PostgreSQL Database Dump with e-commerce schema

-- Create Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create User Roles table
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create User-Role junction table
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

-- Create Categories table
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- Create Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_created_by ON products(created_by);

-- Create Product Tags table
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Product-Tag junction table
CREATE TABLE product_tags (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

-- Create Orders table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  shipping_address TEXT NOT NULL,
  billing_address TEXT NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Create Order Items table
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_unit DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Create Product Reviews table
CREATE TABLE product_reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, user_id)
);
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX idx_product_reviews_user ON product_reviews(user_id);

-- Create Order Status History table
CREATE TABLE order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status VARCHAR(20) CHECK (old_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  comment TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);

-- Insert sample data

-- Roles
INSERT INTO roles (name, description) VALUES
('admin', 'Administrator with full access'),
('manager', 'Can manage products and orders'),
('customer', 'Regular customer');

-- Users
INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES
('admin_user', 'admin@example.com', '$2a$12$KNxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'Admin', 'User'),
('john_doe', 'john@example.com', '$2a$12$5KxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'John', 'Doe'),
('jane_smith', 'jane@example.com', '$2a$12$9JxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'Jane', 'Smith');

-- User Roles
INSERT INTO user_roles (user_id, role_id) VALUES
(1, 1), -- admin is admin
(2, 3), -- john is customer
(3, 2); -- jane is manager

-- Create view for product details
CREATE VIEW product_details AS
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
CREATE OR REPLACE FUNCTION get_stock_status(stock INTEGER) 
RETURNS VARCHAR(20) AS $$
DECLARE
  status VARCHAR(20);
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create view using the function
CREATE VIEW product_inventory AS
SELECT 
  p.id,
  p.name,
  p.stock_quantity,
  get_stock_status(p.stock_quantity) AS stock_status
FROM products p;

-- Create procedure to get user's orders
CREATE OR REPLACE PROCEDURE get_user_orders(user_id_param INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT o.id, o.status, o.total_amount, o.created_at,
         oi.product_id, p.name as product_name, oi.quantity, oi.price_per_unit
  FROM orders o
  JOIN order_items oi ON o.id = oi.order_id
  JOIN products p ON oi.product_id = p.id
  WHERE o.user_id = user_id_param
  ORDER BY o.created_at DESC;
END;
$$;

-- Create procedure to update product stock
CREATE OR REPLACE PROCEDURE update_product_stock(product_id_param INTEGER, new_quantity INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE products
  SET stock_quantity = new_quantity,
      updated_at = NOW()
  WHERE id = product_id_param;
  
  -- Log the stock update
  RAISE NOTICE 'Stock updated for product % to %', product_id_param, new_quantity;
END;
$$;

-- Create trigger for order status updates
CREATE OR REPLACE FUNCTION track_order_status_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO order_status_history (order_id, old_status, new_status, updated_at)
    VALUES (NEW.id, OLD.status, NEW.status, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_status_updated
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION track_order_status_changes();
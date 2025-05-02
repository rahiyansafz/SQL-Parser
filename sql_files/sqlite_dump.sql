-- SQLite Database Dump with e-commerce schema

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Create Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create User Roles table
CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create User-Role junction table
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- Create Categories table
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- Create Products table
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price REAL NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_created_by ON products(created_by);

-- Create Product Tags table
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Product-Tag junction table
CREATE TABLE product_tags (
  product_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, tag_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX idx_product_tags_product ON product_tags(product_id);
CREATE INDEX idx_product_tags_tag ON product_tags(tag_id);

-- Create Orders table
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  shipping_address TEXT NOT NULL,
  billing_address TEXT NOT NULL,
  total_amount REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Create Order Items table
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_unit REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Create Product Reviews table
CREATE TABLE product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, user_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX idx_product_reviews_user ON product_reviews(user_id);

-- Create Order Status History table
CREATE TABLE order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  old_status TEXT CHECK (old_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  new_status TEXT NOT NULL CHECK (new_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  comment TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
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

-- Create stock status function (using a trigger in SQLite since functions are limited)
CREATE TRIGGER trg_product_inventory_update
AFTER UPDATE OF stock_quantity ON products
BEGIN
    -- SQLite doesn't support complex functions, so we'll handle this in the application
    SELECT CASE 
        WHEN NEW.stock_quantity = 0 THEN 'Out of stock'
        WHEN NEW.stock_quantity < 10 THEN 'Low stock'
        ELSE 'In stock'
    END;
END;

-- Create view for product inventory status
CREATE VIEW product_inventory AS
SELECT 
  p.id,
  p.name,
  p.stock_quantity,
  CASE 
    WHEN p.stock_quantity = 0 THEN 'Out of stock'
    WHEN p.stock_quantity < 10 THEN 'Low stock'
    ELSE 'In stock'
  END AS stock_status
FROM products p;

-- Create trigger for order status updates (since SQLite doesn't support stored procedures)
CREATE TRIGGER trg_order_status_updated
AFTER UPDATE ON orders
WHEN OLD.status != NEW.status
BEGIN
  INSERT INTO order_status_history (order_id, old_status, new_status, updated_at)
  VALUES (NEW.id, OLD.status, NEW.status, datetime('now'));
END;
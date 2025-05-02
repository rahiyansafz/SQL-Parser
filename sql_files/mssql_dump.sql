-- MS SQL Server Database Dump with e-commerce schema

-- Create Users table
CREATE TABLE Users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  username NVARCHAR(50) NOT NULL UNIQUE,
  email NVARCHAR(100) NOT NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  first_name NVARCHAR(50) NULL,
  last_name NVARCHAR(50) NULL,
  is_active BIT DEFAULT 1,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE()
);

-- Create User Roles table
CREATE TABLE Roles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(50) NOT NULL UNIQUE,
  description NTEXT NULL,
  created_at DATETIME2 DEFAULT GETDATE()
);

-- Create User-Role junction table
CREATE TABLE UserRoles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  assigned_at DATETIME2 DEFAULT GETDATE(),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT FK_UserRoles_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT FK_UserRoles_Roles FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE
);

-- Create Categories table
CREATE TABLE Categories (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  slug NVARCHAR(100) NOT NULL UNIQUE,
  description NTEXT NULL,
  parent_id INT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_Categories_Categories FOREIGN KEY (parent_id) REFERENCES Categories(id) ON DELETE SET NULL
);
CREATE INDEX IX_Categories_ParentId ON Categories(parent_id);

-- Create Products table
CREATE TABLE Products (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(255) NOT NULL,
  slug NVARCHAR(255) NOT NULL UNIQUE,
  description NTEXT NULL,
  price MONEY NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  category_id INT NOT NULL,
  created_by INT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_Products_Categories FOREIGN KEY (category_id) REFERENCES Categories(id) ON DELETE CASCADE,
  CONSTRAINT FK_Products_Users FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
);
CREATE INDEX IX_Products_CategoryId ON Products(category_id);
CREATE INDEX IX_Products_CreatedBy ON Products(created_by);

-- Create Product Tags table
CREATE TABLE Tags (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(50) NOT NULL UNIQUE,
  created_at DATETIME2 DEFAULT GETDATE()
);

-- Create Product-Tag junction table
CREATE TABLE ProductTags (
  product_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (product_id, tag_id),
  CONSTRAINT FK_ProductTags_Products FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE,
  CONSTRAINT FK_ProductTags_Tags FOREIGN KEY (tag_id) REFERENCES Tags(id) ON DELETE CASCADE
);

-- Create Orders table
CREATE TABLE Orders (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT 'pending',
  shipping_address NTEXT NOT NULL,
  billing_address NTEXT NOT NULL,
  total_amount MONEY NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_Orders_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT CK_Orders_Status CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled'))
);
CREATE INDEX IX_Orders_UserId ON Orders(user_id);
CREATE INDEX IX_Orders_Status ON Orders(status);

-- Create Order Items table
CREATE TABLE OrderItems (
  id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price_per_unit MONEY NOT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE,
  CONSTRAINT FK_OrderItems_Products FOREIGN KEY (product_id) REFERENCES Products(id),
  CONSTRAINT CK_OrderItems_Quantity CHECK (quantity > 0)
);
CREATE INDEX IX_OrderItems_OrderId ON OrderItems(order_id);
CREATE INDEX IX_OrderItems_ProductId ON OrderItems(product_id);

-- Create Product Reviews table
CREATE TABLE ProductReviews (
  id INT IDENTITY(1,1) PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
  rating INT NOT NULL,
  review_text NTEXT NULL,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_ProductReviews_Products FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE,
  CONSTRAINT FK_ProductReviews_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT CK_ProductReviews_Rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT UQ_ProductReviews_ProductIdUserId UNIQUE (product_id, user_id)
);
CREATE INDEX IX_ProductReviews_ProductId ON ProductReviews(product_id);
CREATE INDEX IX_ProductReviews_UserId ON ProductReviews(user_id);

-- Create Order Status History table
CREATE TABLE OrderStatusHistory (
  id INT IDENTITY(1,1) PRIMARY KEY,
  order_id INT NOT NULL,
  old_status NVARCHAR(20) NULL,
  new_status NVARCHAR(20) NOT NULL,
  updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  CONSTRAINT FK_OrderStatusHistory_Orders FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE,
  CONSTRAINT CK_OrderStatusHistory_OldStatus CHECK (old_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled') OR old_status IS NULL),
  CONSTRAINT CK_OrderStatusHistory_NewStatus CHECK (new_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled'))
);
CREATE INDEX IX_OrderStatusHistory_OrderId ON OrderStatusHistory(order_id);

GO

-- Insert sample data

-- Roles
INSERT INTO Roles (name, description) VALUES
('admin', 'Administrator with full access'),
('manager', 'Can manage products and orders'),
('customer', 'Regular customer');

-- Users
INSERT INTO Users (username, email, password_hash, first_name, last_name) VALUES
('admin_user', 'admin@example.com', '$2a$12$KNxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'Admin', 'User'),
('john_doe', 'john@example.com', '$2a$12$5KxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'John', 'Doe'),
('jane_smith', 'jane@example.com', '$2a$12$9JxVqEJjZmzfRD1X7hOKveSn8TvxJySF3thOB4R9xEObCU1kDXBgi', 'Jane', 'Smith');

-- User Roles
INSERT INTO UserRoles (user_id, role_id) VALUES
(1, 1), -- admin is admin
(2, 3), -- john is customer
(3, 2); -- jane is manager

GO

-- Create view for product details
CREATE VIEW ProductDetails AS
SELECT 
  p.id, 
  p.name, 
  p.description, 
  p.price, 
  p.stock_quantity, 
  c.name AS category_name,
  u.username AS created_by_username
FROM Products p
JOIN Categories c ON p.category_id = c.id
LEFT JOIN Users u ON p.created_by = u.id;

GO

-- Create function to get product stock status
CREATE FUNCTION GetStockStatus(@stock INT)
RETURNS NVARCHAR(20)
AS
BEGIN
  DECLARE @status NVARCHAR(20);
  
  IF @stock = 0
    SET @status = 'Out of stock';
  ELSE IF @stock < 10
    SET @status = 'Low stock';
  ELSE
    SET @status = 'In stock';
    
  RETURN @status;
END;

GO

-- Create view using the function
CREATE VIEW ProductInventory AS
SELECT 
  p.id,
  p.name,
  p.stock_quantity,
  dbo.GetStockStatus(p.stock_quantity) AS stock_status
FROM Products p;

GO

-- Create stored procedure to get user's orders
CREATE PROCEDURE GetUserOrders
  @userId INT
AS
BEGIN
  SELECT o.id, o.status, o.total_amount, o.created_at,
         oi.product_id, p.name as product_name, oi.quantity, oi.price_per_unit
  FROM Orders o
  JOIN OrderItems oi ON o.id = oi.order_id
  JOIN Products p ON oi.product_id = p.id
  WHERE o.user_id = @userId
  ORDER BY o.created_at DESC;
END;

GO

-- Create stored procedure to update product stock
CREATE PROCEDURE UpdateProductStock
  @productId INT,
  @newQuantity INT
AS
BEGIN
  UPDATE Products
  SET stock_quantity = @newQuantity,
      updated_at = GETDATE()
  WHERE id = @productId;
  
  -- Log the stock update
  PRINT 'Stock updated for product ' + CAST(@productId AS NVARCHAR) + ' to ' + CAST(@newQuantity AS NVARCHAR);
END;

GO

-- Create trigger for order status updates
CREATE TRIGGER trg_OrderStatusUpdated
ON Orders
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  
  -- Check if status was changed
  IF UPDATE(status)
  BEGIN
    INSERT INTO OrderStatusHistory (order_id, old_status, new_status, updated_at)
    SELECT i.id, d.status, i.status, GETDATE()
    FROM inserted i
    JOIN deleted d ON i.id = d.id
    WHERE i.status <> d.status;
  END
END;
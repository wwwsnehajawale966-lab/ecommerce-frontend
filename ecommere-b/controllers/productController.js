const db = require('../config/db');

// Get all products (with pagination and filtering)
const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search, minPrice, maxPrice, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
    
    let query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = true
    `;
    const params = [];
    let paramIndex = 1;

    // Add search filter
    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Add category filter
    if (category) {
      query += ` AND p.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Add price range filters
    if (minPrice) {
      query += ` AND p.price >= $${paramIndex}`;
      params.push(minPrice);
      paramIndex++;
    }

    if (maxPrice) {
      query += ` AND p.price <= $${paramIndex}`;
      params.push(maxPrice);
      paramIndex++;
    }

    // Add sorting
    const validSortColumns = ['name', 'price', 'created_at', 'stock_quantity'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY p.${sortColumn} ${sortDirection}`;

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM products p 
      WHERE p.is_active = true
    `;
    const countParams = [];
    let countIndex = 1;

    if (search) {
      countQuery += ` AND (p.name ILIKE $${countIndex} OR p.description ILIKE $${countIndex})`;
      countParams.push(`%${search}%`);
      countIndex++;
    }

    if (category) {
      countQuery += ` AND p.category_id = $${countIndex}`;
      countParams.push(category);
      countIndex++;
    }

    if (minPrice) {
      countQuery += ` AND p.price >= $${countIndex}`;
      countParams.push(minPrice);
      countIndex++;
    }

    if (maxPrice) {
      countQuery += ` AND p.price <= $${countIndex}`;
      countParams.push(maxPrice);
    }

    const countResult = await db.query(countQuery, countParams);
    const totalProducts = parseInt(countResult.rows[0].total);

    res.json({
      products: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalProducts / limit),
        total_products: totalProducts,
        has_next: page * limit < totalProducts,
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Server error while fetching products' });
  }
};

// Get single product by ID
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = $1 AND p.is_active = true
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ product: result.rows[0] });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Server error while fetching product' });
  }
};

// Create new product
const createProduct = async (req, res) => {
  try {
    const { name, description, price, category_id, stock_quantity, image_url } = req.body;

    // Validate required fields
    if (!name || !price || !category_id || stock_quantity === undefined) {
      return res.status(400).json({ 
        message: 'Required fields: name, price, category_id, stock_quantity' 
      });
    }

    // Validate price and stock
    if (price < 0 || stock_quantity < 0) {
      return res.status(400).json({ 
        message: 'Price and stock quantity must be non-negative' 
      });
    }

    // Check if category exists
    const categoryResult = await db.query('SELECT id FROM categories WHERE id = $1 AND is_active = true', [category_id]);
    if (categoryResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const result = await db.query(`
      INSERT INTO products (name, description, price, category_id, stock_quantity, image_url, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [name, description, price, category_id, stock_quantity, image_url]);

    res.status(201).json({
      message: 'Product created successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ message: 'Server error while creating product' });
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category_id, stock_quantity, image_url, is_active } = req.body;

    // Check if product exists
    const productResult = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Validate category if provided
    if (category_id) {
      const categoryResult = await db.query('SELECT id FROM categories WHERE id = $1 AND is_active = true', [category_id]);
      if (categoryResult.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid category ID' });
      }
    }

    // Validate price and stock if provided
    if (price !== undefined && price < 0) {
      return res.status(400).json({ message: 'Price must be non-negative' });
    }
    if (stock_quantity !== undefined && stock_quantity < 0) {
      return res.status(400).json({ message: 'Stock quantity must be non-negative' });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex}`);
      params.push(price);
      paramIndex++;
    }
    if (category_id !== undefined) {
      updates.push(`category_id = $${paramIndex}`);
      params.push(category_id);
      paramIndex++;
    }
    if (stock_quantity !== undefined) {
      updates.push(`stock_quantity = $${paramIndex}`);
      params.push(stock_quantity);
      paramIndex++;
    }
    if (image_url !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      params.push(image_url);
      paramIndex++;
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await db.query(`
      UPDATE products 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

    res.json({
      message: 'Product updated successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Server error while updating product' });
  }
};

// Delete product (soft delete - set is_active to false)
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      UPDATE products 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_active = true
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      message: 'Product deleted successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Server error while deleting product' });
  }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 10, sortBy = 'name', sortOrder = 'ASC' } = req.query;

    // Check if category exists
    const categoryResult = await db.query('SELECT id FROM categories WHERE id = $1 AND is_active = true', [categoryId]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const validSortColumns = ['name', 'price', 'created_at', 'stock_quantity'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
    const sortDirection = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT * FROM products 
      WHERE category_id = $1 AND is_active = true 
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT $2 OFFSET $3
    `, [categoryId, limit, offset]);

    const countResult = await db.query(`
      SELECT COUNT(*) as total FROM products 
      WHERE category_id = $1 AND is_active = true
    `, [categoryId]);

    const totalProducts = parseInt(countResult.rows[0].total);

    res.json({
      products: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalProducts / limit),
        total_products: totalProducts,
        has_next: page * limit < totalProducts,
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ message: 'Server error while fetching products by category' });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory
};

const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory
} = require('../controllers/productController');

// GET /api/products - Get all products with filtering and pagination
router.get('/', getProducts);

// GET /api/products/category/:categoryId - Get products by category
router.get('/category/:categoryId', getProductsByCategory);

// GET /api/products/:id - Get single product by ID
router.get('/:id', getProductById);

// POST /api/products - Create new product
router.post('/', createProduct);

// PUT /api/products/:id - Update product
router.put('/:id', updateProduct);

// DELETE /api/products/:id - Delete product (soft delete)
router.delete('/:id', deleteProduct);

module.exports = router;

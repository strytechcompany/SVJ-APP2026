const express = require('express');
const router = express.Router();
const {
  listUsers,
  createUser,
  updateUser,
  toggleStatus,
  resetMemberPassword,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('SuperAdmin'));

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.put('/:id/status', toggleStatus);
router.put('/:id/reset-password', resetMemberPassword);

module.exports = router;

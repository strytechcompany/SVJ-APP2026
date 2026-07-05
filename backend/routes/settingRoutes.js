const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/', protect, settingController.getSettings);
router.put('/', protect, authorize('SuperAdmin', 'Admin'), settingController.updateSettings);

router.post('/backup', protect, authorize('SuperAdmin', 'Admin'), settingController.backupDatabase);
router.post('/restore', protect, authorize('SuperAdmin', 'Admin'), settingController.restoreDatabase);
router.post('/recalculate', protect, authorize('SuperAdmin', 'Admin'), settingController.recalculateData);
router.get('/status', protect, settingController.getServerStatus);

module.exports = router;

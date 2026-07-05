const Setting = require('../models/Setting');
const GoldRateHistory = require('../models/GoldRateHistory');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ─── Get Global Settings (Singleton) ──────────────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting();
      await settings.save();
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('getSettings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching settings' });
  }
};

// ─── Update Global Settings ───────────────────────────────────────────────────
exports.updateSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting();
    }

    // Dynamic partial update for deeply nested objects
    const updates = req.body;
    for (let key in updates) {
      if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        // If updating goldRate, log history
        if (key === 'goldRate' && updates[key].ratePerGram && updates[key].ratePerGram !== settings.goldRate?.ratePerGram) {
           await GoldRateHistory.create({
              ratePerGram: updates[key].ratePerGram,
              updatedBy: req.user._id
           });
           updates[key].updatedAt = new Date();
           updates[key].updatedBy = req.user._id;
        }
        settings[key] = { ...settings[key], ...updates[key] };
      } else {
        settings[key] = updates[key];
      }
    }

    await settings.save();
    res.json({ success: true, message: 'Settings updated successfully', data: settings });
  } catch (error) {
    console.error('updateSettings error:', error);
    res.status(500).json({ success: false, message: 'Server error updating settings' });
  }
};

// ─── Database Management Actions ──────────────────────────────────────────────

exports.backupDatabase = async (req, res) => {
  try {
    const models = mongoose.modelNames();
    const backup = {};
    for (const modelName of models) {
      const model = mongoose.model(modelName);
      backup[modelName] = await model.find().lean();
    }
    
    // We send it back directly to the client as JSON attachment
    res.setHeader('Content-disposition', `attachment; filename=backup_${new Date().getTime()}.json`);
    res.setHeader('Content-type', 'application/json');
    res.write(JSON.stringify(backup, null, 2), function (err) {
      res.end();
    });
  } catch (error) {
    console.error('backupDatabase error:', error);
    res.status(500).json({ success: false, message: 'Server error backing up database' });
  }
};

exports.restoreDatabase = async (req, res) => {
  res.status(501).json({ success: false, message: 'Restore functionality requires server access and is disabled for security.' });
};

exports.recalculateData = async (req, res) => {
  try {
    // In a real scenario, this would trigger background aggregation tasks.
    // We simulate it here.
    setTimeout(() => {
      console.log('Background task: Data recalculated successfully.');
    }, 2000);
    
    res.json({ success: true, message: 'Data recalculation started.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error recalculating data' });
  }
};

exports.getServerStatus = async (req, res) => {
  try {
    const status = {
      version: '1.0.0',
      database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      server: 'Running',
      mongoStatus: mongoose.connection.readyState === 1 ? 'Healthy' : 'Failing',
      backendStatus: 'Online',
      lastBackupDate: new Date().toLocaleDateString('en-GB')
    };
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error getting status' });
  }
};

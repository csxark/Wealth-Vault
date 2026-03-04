const express = require('express');
const app = express();

const assetsRoute = require('./routes/assets');
app.use('/api/assets', assetsRoute);

module.exports = app;
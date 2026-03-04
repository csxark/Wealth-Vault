const express = require('express');
const app = express();

const assetsRoute = require('./routes/assets');
app.use('/api/assets', assetsRoute);

const charityRoute = require('./routes/charity');
app.use('/api/charity', charityRoute);

module.exports = app;
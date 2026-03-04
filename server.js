const express = require('express');
const app = express();

const assetsRoute = require('./routes/assets');
app.use('/api/assets', assetsRoute);

const charityRoute = require('./routes/charity');
app.use('/api/charity', charityRoute);

const creditRoute = require('./routes/credit');
app.use('/api/credit', creditRoute);

module.exports = app;
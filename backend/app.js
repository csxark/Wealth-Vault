// Main Express App
const express = require('express');
const bodyParser = require('body-parser');
const forecasterApi = require('./api/forecasterApi');

const app = express();
app.use(bodyParser.json());
app.use('/api', forecasterApi);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Adaptive Emergency Fund Forecaster API running on port ${PORT}`);
});

module.exports = app;

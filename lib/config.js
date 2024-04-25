const path = require('path');
require('dotenv-defaults').config();

const config = {
    token: process.env.TOKEN,
    bamboo_token: process.env.BAMBOO_TOKEN,
    bamboo_subdomain: process.env.BAMBOO_SUBDOMAIN,
    json_file_store: path.join(__dirname, '..', 'data'),
};

module.exports = config;

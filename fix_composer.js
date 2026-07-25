const fs = require('fs');
const path = require('path');

const composerPath = path.join(__dirname, 'backend', 'composer.json');
const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));

// Remove old dependencies
delete composer.require['phpoffice/phpspreadsheet'];

// Update maatwebsite/excel
composer.require['maatwebsite/excel'] = '^3.1';

fs.writeFileSync(composerPath, JSON.stringify(composer, null, 4));

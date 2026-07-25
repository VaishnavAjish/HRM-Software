const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'backend', 'app', 'Http', 'Controllers', 'Admin', 'AdminController.php');
let adminCode = fs.readFileSync(adminPath, 'utf8');
adminCode = adminCode.replace(
    /\\\ = Excel::toArray\(new \\\\stdClass, \\\->file\('salary_slip'\)\);\s*\\\ = \\\\[0\] \?\? \[\];/,
    "\\\ = \\\\PhpOffice\\\\PhpSpreadsheet\\\\IOFactory::load(\\\->file('salary_slip')->getPathname());\n            \\\ = \\\->getActiveSheet()->toArray();"
);
fs.writeFileSync(adminPath, adminCode, 'utf8');

const userPath = path.join(__dirname, 'backend', 'app', 'Http', 'Controllers', 'UserController.php');
let userCode = fs.readFileSync(userPath, 'utf8');
userCode = userCode.replace(
    /\\\ = Excel::toArray\(new \\\\stdClass\(\), \\\\);\s*\\\ = \\\\[0\] \?\? \[\];/g,
    "\\\ = \\\\PhpOffice\\\\PhpSpreadsheet\\\\IOFactory::load(\\\->getPathname());\n            \\\ = \\\->getActiveSheet()->toArray();"
);
userCode = userCode.replace(
    /\\\ = Excel::toArray\(new \\\\stdClass\(\), \\\->file\('file'\)\);\s*\\\ = \\\\[0\] \?\? \[\];/g,
    "\\\ = \\\\PhpOffice\\\\PhpSpreadsheet\\\\IOFactory::load(\\\->file('file')->getPathname());\n            \\\ = \\\->getActiveSheet()->toArray();"
);
fs.writeFileSync(userPath, userCode, 'utf8');

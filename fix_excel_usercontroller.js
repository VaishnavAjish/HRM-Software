const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend', 'app', 'Http', 'Controllers', 'UserController.php');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/Excel::toArray\(\[\],/g, 'Excel::toArray(new \\stdClass(),');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed UserController.php');

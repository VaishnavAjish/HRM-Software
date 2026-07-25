const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend', 'app', 'Http', 'Controllers', 'Admin', 'AdminController.php');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  /} catch (\\Exception \) {/,
  '} catch (\\Throwable ) {'
);

fs.writeFileSync(filePath, content, 'utf8');

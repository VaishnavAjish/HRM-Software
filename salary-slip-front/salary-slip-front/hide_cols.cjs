const fs = require('fs');
const file = '//192.168.1.53/f/HRMS oldd/salary-slip-front/salary-slip-front/src/pages/admin/EmployeeManagement.jsx';
let content = fs.readFileSync(file, 'utf8');

const visibleFields = ['empCode', 'name', 'companyLabel', 'loginRole', 'department', 'designation', 'actions'];

content = content.replace(/\{\s*headerName:\s*"[^"]+",\s*field:\s*"([^"]+)"[\s\S]*?\},/g, (match, field) => {
  if (visibleFields.includes(field) || field === 'mobileDetails') {
    return match;
  }
  return match.replace(/hide:\s*isMobile,/g, 'hide: true,');
});

fs.writeFileSync(file, content);
console.log('Done');

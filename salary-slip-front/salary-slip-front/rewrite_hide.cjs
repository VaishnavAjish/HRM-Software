const fs = require('fs');
const file = '//192.168.1.53/f/HRMS oldd/salary-slip-front/salary-slip-front/src/pages/admin/EmployeeManagement.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace `hide: true` or `hide: isMobile` with `hide: isMobile || !visibleColumns.includes("FIELDNAME")`
content = content.replace(/\{\s*headerName:\s*"[^"]+",\s*field:\s*"([^"]+)"[\s\S]*?\},/g, (match, field) => {
  if (field === 'mobileDetails' || field === 'actions') {
    return match;
  }
  
  // replace any existing hide: ... with hide: isMobile || !visibleColumns.includes("field")
  if (match.includes('hide:')) {
    return match.replace(/hide:\s*[^,]+,/g, `hide: isMobile || !visibleColumns.includes("${field}"),`);
  } else {
    // inject hide property
    return match.replace(/field:\s*"[^"]+",/g, `$& hide: isMobile || !visibleColumns.includes("${field}"),`);
  }
});

fs.writeFileSync(file, content);
console.log('Done rewriting hide properties');

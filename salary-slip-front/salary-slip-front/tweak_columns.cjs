const fs = require('fs');
const file = '//192.168.1.53/f/HRMS oldd/salary-slip-front/salary-slip-front/src/pages/admin/EmployeeManagement.jsx';
let content = fs.readFileSync(file, 'utf8');

const adjustments = {
  empCode: { minWidth: 110, maxWidth: 140, flex: 0 },
  name: { minWidth: 180, flex: 2 },
  department: { minWidth: 140, flex: 1.5 },
  designation: { minWidth: 140, flex: 1.5 },
  companyLabel: { minWidth: 140, flex: 1.5 },
  loginRole: { minWidth: 120, maxWidth: 140, flex: 0 },
  actions: { minWidth: 120, maxWidth: 120, flex: 0 },
};

content = content.replace(/\{\s*headerName:\s*"[^"]+",\s*field:\s*"([^"]+)"([\s\S]*?)\},/g, (match, field, inner) => {
  if (adjustments[field]) {
    const adj = adjustments[field];
    let newInner = inner;
    
    // replace or add minWidth
    if (/minWidth:\s*\d+,/.test(newInner)) {
      newInner = newInner.replace(/minWidth:\s*\d+,/, `minWidth: ${adj.minWidth},`);
    } else {
      newInner += ` minWidth: ${adj.minWidth},`;
    }
    
    // replace or add flex
    if (adj.flex !== undefined) {
      if (/flex:\s*[\d.]+,/.test(newInner)) {
        newInner = newInner.replace(/flex:\s*[\d.]+,/, `flex: ${adj.flex},`);
      } else {
        newInner += ` flex: ${adj.flex},`;
      }
    }
    
    // replace or add maxWidth
    if (adj.maxWidth !== undefined) {
      if (/maxWidth:\s*\d+,/.test(newInner)) {
        newInner = newInner.replace(/maxWidth:\s*\d+,/, `maxWidth: ${adj.maxWidth},`);
      } else {
        newInner += ` maxWidth: ${adj.maxWidth},`;
      }
    }
    
    return match.replace(inner, newInner);
  }
  return match;
});

fs.writeFileSync(file, content);
console.log('Done tweaking columns');

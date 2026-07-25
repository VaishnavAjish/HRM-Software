const fs = require('fs');
const path = require('path');

const filesToPatch = [
  path.join(__dirname, 'frontend', 'src', 'pages', 'admin', 'Appointments.jsx'),
  path.join(__dirname, 'frontend', 'src', 'pages', 'admin', 'TrialForm.jsx')
];

for (const filePath of filesToPatch) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add valueFormatter to object columns
    content = content.replace(/field:\s*"members",/g, 'field: "members", valueFormatter: () => "Data",');
    content = content.replace(/field:\s*"adharImage",/g, 'field: "adharImage", valueFormatter: () => "Image",');
    content = content.replace(/field:\s*"panImage",/g, 'field: "panImage", valueFormatter: () => "Image",');
    content = content.replace(/field:\s*"chequeImage",/g, 'field: "chequeImage", valueFormatter: () => "Image",');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched ' + path.basename(filePath));
  }
}

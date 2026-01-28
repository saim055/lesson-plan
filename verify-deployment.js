const fs = require('fs');
const path = require('path');

console.log('=== Deployment Verification ===');
console.log('Current directory:', __dirname);
console.log('Files in directory:', fs.readdirSync(__dirname));

const templatePath = path.join(__dirname, 'LESSON PLAN TEMPLATE.docx');
console.log('Template path:', templatePath);
console.log('Template exists:', fs.existsSync(templatePath));

if (fs.existsSync(templatePath)) {
  const stats = fs.statSync(templatePath);
  console.log('Template size:', stats.size, 'bytes');
  console.log('Template is file:', stats.isFile());
} else {
  console.log('❌ TEMPLATE FILE MISSING!');
  console.log('This file must be included in your deployment ZIP');
}

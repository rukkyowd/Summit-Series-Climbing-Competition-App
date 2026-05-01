const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_FILE = path.join(__dirname, 'codebase_dump.txt');

// Folders to completely ignore
const IGNORE_DIRS = [
  'node_modules', 
  '.next', 
  '.git', 
  'public', 
  'dist', 
  'build',
  '.vercel'
];

// File extensions to include (add or remove as needed)
const ALLOWED_EXTS = [
  '.ts', 
  '.tsx', 
  '.js', 
  '.jsx', 
  '.json', 
  '.sql', 
  '.css', 
  '.md'
];

function generateDump() {
  // Clear existing dump file if it exists
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }

  function walkSync(currentDirPath) {
    const files = fs.readdirSync(currentDirPath);
    
    for (const name of files) {
      const filePath = path.join(currentDirPath, name);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        const ext = path.extname(name);
        // Only grab files with allowed extensions and ignore the dump script itself
        if (ALLOWED_EXTS.includes(ext) && name !== 'dump.js' && name !== 'package-lock.json') {
          const relativePath = path.relative(__dirname, filePath);
          const content = fs.readFileSync(filePath, 'utf8');
          const header = `\n\n--- ${relativePath} ---\n\n`;
          fs.appendFileSync(OUTPUT_FILE, header + content);
        }
      } else if (stat.isDirectory()) {
        // Skip ignored directories
        if (!IGNORE_DIRS.includes(name)) {
          walkSync(filePath);
        }
      }
    }
  }

  walkSync(__dirname);
  console.log(`✅ Codebase successfully dumped to ${OUTPUT_FILE}`);
}

generateDump();
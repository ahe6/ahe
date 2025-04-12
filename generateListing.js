const fs = require('fs');
const path = require('path');
const toHTML = require('directory-index-html');

// Files to hide from listings
const blacklist = [
  'CNAME',
  'node_modules',
  'package.json',
  'package-lock.json',
  'generateListing.js',
  'index.html',
  '.git',
  '.gitignore',
  '.gitmodules',
  '.nojekyll',
  'listing.html'
];

// Get the absolute root path of the project
const ROOT_PATH = path.resolve(__dirname);

function shouldSkipDirectory(dirPath) {
  const baseName = path.basename(dirPath);
  return blacklist.includes(baseName) || dirPath.includes('/.git/');
}

function getDirectoryEntries(dirPath) {
  // Skip blacklisted directories
  if (shouldSkipDirectory(dirPath)) {
    return [];
  }

  const relativePath = path.relative(ROOT_PATH, dirPath);
  return fs.readdirSync(dirPath)
    .filter(file => !blacklist.includes(file) && file !== 'index.html')
    .map(file => {
      const fullPath = path.join(dirPath, file);
      const stats = fs.statSync(fullPath);
      
      // If it's a directory, try to find the oldest file in it
      let mtime = stats.mtime;
      if (stats.isDirectory()) {
        try {
          const files = fs.readdirSync(fullPath);
          files.forEach(subfile => {
            if (subfile !== 'index.html') {
              const subStats = fs.statSync(path.join(fullPath, subfile));
              if (subStats.mtime < mtime) {
                mtime = subStats.mtime;
              }
            }
          });
        } catch (e) {
          // If we can't read the directory, just use its own mtime
        }
      }
      
      return {
        file,
        stats,
        mtime,
        isDir: stats.isDirectory()
      };
    })
    .sort((a, b) => {
      // Always put aboutme.html first
      if (a.file === 'aboutme.html') return -1;
      if (b.file === 'aboutme.html') return 1;
      // Then sort by date, newest first
      return b.mtime - a.mtime;
    })
    .map(({ file, stats, mtime, isDir }) => {
      return {
        name: isDir ? `${file}/` : file,
        size: isDir ? undefined : stats.size,
        mtime: mtime,
        type: isDir ? 'directory' : 'file'
      };
    });
}

function generateListingRecursive(currentPath) {
  console.log(`Generating listing for: ${currentPath}`);
  const entries = getDirectoryEntries(currentPath);
  
  // Get path relative to root for the title
  const relativePath = path.relative(ROOT_PATH, currentPath);
  const displayPath = relativePath || '/';

  // Generate HTML with root-relative paths
  // Add cache control headers to prevent browser caching
  const cacheControlMeta = '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">';
  const pragmaMeta = '<meta http-equiv="Pragma" content="no-cache">';
  const expiresMeta = '<meta http-equiv="Expires" content="0">';
  
  let html = toHTML(displayPath, entries, {
    filter: false,
    root: '/' // Use root-relative paths
  });

  // Insert meta tags after <head>
  html = html.replace('<head>', '<head>\n  ' + cacheControlMeta + '\n  ' + pragmaMeta + '\n  ' + expiresMeta);


  const indexPath = path.join(currentPath, 'index.html');
  console.log(`Creating index at: ${indexPath}`);
  
  // Write index.html but try to preserve timestamps of other files
  const oldStats = fs.existsSync(indexPath) ? fs.statSync(indexPath) : null;
  fs.writeFileSync(indexPath, html);
  if (oldStats) {
    try {
      fs.utimesSync(indexPath, oldStats.atime, oldStats.mtime);
    } catch (e) {
      console.warn(`Could not preserve timestamps for ${indexPath}`);
    }
  }
  
  // Only process non-blacklisted subdirectories
  entries
    .filter(entry => entry.type === 'directory' && !shouldSkipDirectory(path.join(currentPath, entry.name)))
    .forEach(entry => {
      const fullPath = path.join(currentPath, entry.name);
      generateListingRecursive(fullPath);
    });
}

// Start from root directory
console.log('Starting directory listing generation from:', ROOT_PATH);
generateListingRecursive(ROOT_PATH);
console.log('Directory listings generated successfully.');

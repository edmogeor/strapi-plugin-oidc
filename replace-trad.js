const fs = require('fs');
const { execSync } = require('child_process');

const files = execSync('find admin/src -name "*.jsx"').toString().split('\n').filter(Boolean);

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    // We want to replace { id: getTrad('foo'), defaultMessage: 'bar' } with getTrad('foo')
    content = content.replace(/\{\s*id:\s*getTrad\((['"])(.*?)\1\)\s*,\s*defaultMessage:\s*.*?\}\s*/gs, "getTrad('$2')");
    // Also handle reversed order: { defaultMessage: 'bar', id: getTrad('foo') }
    content = content.replace(/\{\s*defaultMessage:\s*.*?,\s*id:\s*getTrad\((['"])(.*?)\1\)\s*\}\s*/gs, "getTrad('$2')");
    // Also if defaultMessage has an expression like defaultMessage: count > 1 ? 'foo' : 'bar'
    // Actually, we can just replace anything inside { id: getTrad(...), ... }
    // Let's use a smarter regex or simple parsing if needed.
    fs.writeFileSync(file, content);
}

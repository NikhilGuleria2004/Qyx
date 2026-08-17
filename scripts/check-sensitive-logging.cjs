const { readFileSync, readdirSync, statSync } = require('fs');
const { join, extname } = require('path');
const { parse } = require('@typescript-eslint/parser');

const SENSITIVE_FIELDS = ['ciphertext', 'public_key', 'signing_key'];
const API_GATEWAY_DIR = join(__dirname, '..', 'apps', 'api-gateway', 'src');

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, files);
    } else if (extname(entry) === '.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

function containsSensitiveField(node) {
  if (node.type === 'Identifier' && SENSITIVE_FIELDS.includes(node.name)) {
    return true;
  }
  if (node.type === 'MemberExpression' && node.property && node.property.type === 'Identifier') {
    if (SENSITIVE_FIELDS.includes(node.property.name)) {
      return true;
    }
  }
  if (node.type === 'ObjectExpression' && node.properties) {
    for (const prop of node.properties) {
      if (prop.type === 'Property' && prop.key && prop.key.type === 'Identifier') {
        if (SENSITIVE_FIELDS.includes(prop.key.name)) {
          return true;
        }
      }
    }
  }
  return false;
}

function checkArgs(args) {
  for (const arg of args) {
    if (containsSensitiveField(arg)) {
      return true;
    }
    if (arg.type === 'TemplateLiteral' && arg.expressions) {
      for (const expr of arg.expressions) {
        if (containsSensitiveField(expr)) {
          return true;
        }
      }
    }
  }
  return false;
}

const files = walkDir(API_GATEWAY_DIR);
let violations = 0;

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const relativePath = file.replace(join(__dirname, '') + '\\', '').replace(/\\/g, '/');

  try {
    const ast = parse(code, { loc: true, range: true });

    const visitor = {
      CallExpression(node) {
        const callee = node.callee;

        if (callee.type === 'MemberExpression') {
          const object = callee.object;
          const property = callee.property;

          if (object.type === 'Identifier' && object.name === 'console' && property.type === 'Identifier') {
            const method = property.name;
            if (['log', 'error', 'warn', 'debug'].includes(method)) {
              if (checkArgs(node.arguments)) {
                console.error(`Sensitive field logging violation in ${relativePath}:${node.loc.start.line}`);
                violations++;
              }
            }
          }

          if (property.type === 'Identifier' && ['log', 'error', 'warn', 'debug'].includes(property.name)) {
            if (checkArgs(node.arguments)) {
              console.error(`Sensitive field logging violation in ${relativePath}:${node.loc.start.line}`);
              violations++;
            }
          }
        }
      },
    };

    const traverse = (node) => {
      if (node.type === 'CallExpression') {
        visitor.CallExpression(node);
      }
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = node[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const c of child) {
              if (c && typeof c === 'object' && c.type) {
                traverse(c);
              }
            }
          } else if (child.type) {
            traverse(child);
          }
        }
      }
    };

    traverse(ast);
  } catch (err) {
    console.error(`Failed to parse ${relativePath}: ${err.message}`);
  }
}

if (violations > 0) {
  console.error(`\nFound ${violations} sensitive field logging violation(s)`);
  process.exit(1);
} else {
  console.log('No sensitive field logging violations found');
  process.exit(0);
}

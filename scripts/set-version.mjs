// usage: npm run set-version 1.0.1
import { readFileSync, writeFileSync } from 'node:fs'
const v = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) { console.error('Give a version like 1.0.1'); process.exit(1) }
const p = JSON.parse(readFileSync('package.json', 'utf8'))
p.version = v
writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
console.log(`Version is now ${v}. Next: git commit -am "release: v${v}" && git tag v${v} && git push && git push --tags`)

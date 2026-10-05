// Rebuild the embedded, self-contained worker using this checkout's exact kernel.
const fs=require('fs'),path=require('path'),vm=require('vm')
const root=path.resolve(__dirname,'..'),file=path.join(root,'client.js')
let source=fs.readFileSync(file,'utf8')
function grab(name) {
  const start=source.indexOf('const '+name+' = ')
  if(start<0)throw Error('Missing kernel function '+name)
  let depth=0
  for(let i=source.indexOf('{',start);i<source.length;i++){
    if(source[i]==='{')depth++
    if(source[i]==='}' && --depth===0)return source.slice(start,i+1)
  }
  throw Error('Unbalanced kernel '+name)
}
/* The kernel list must track client.js: `contourStepFor` joined it when the grid
   gained a cell cap (contourBuild reads it), and the constants it and the kernel
   close over live in src/contour-worker.js because this script only extracts
   FUNCTIONS — a missing one is a ReferenceError inside the worker at runtime. */
const names=['contourRng','contourStepFor','contourBuild','contourBuildCandidate','contourCoverageScore',
  'contourEvaluate','contourExtractLevel','contourExtract','contourDrawLines']
let worker=fs.readFileSync(path.join(root,'src/contour-worker.js'),'utf8')
worker=worker.replace('/* CONTOUR_KERNEL */',names.map(grab).join('\n'))
worker=worker.replace('/* CONTOUR_WEBGL */',fs.readFileSync(path.join(root,'src/contour-webgl.js'),'utf8'))
// The artifact must be byte-stable across checkouts: JSON.stringify preserves
// raw \r\n, so a CRLF working tree would bake \r into the embedded string and a
// normalized LF copy of the same sources would rebuild to a different blob —
// failing the equality gate on a copy that is not stale. LF is also what the
// runtime Blob worker expects.
worker=worker.replace(/\r\n/g,'\n')
new vm.Script(worker)
const start='    /* BEGIN GENERATED CONTOUR WORKER */',end='    /* END GENERATED CONTOUR WORKER */'
const a=source.indexOf(start),b=source.indexOf(end,a)
if(a<0 || b<0)throw Error('Missing generated worker markers')
// The equality test below is byte-for-byte, so the two separators this writes
// have to be the checkout's own: a CRLF working tree (core.autocrlf on Windows)
// joined with '\n' would leave the gate failing on a copy that is not stale.
const nl=source.includes('\r\n')?'\r\n':'\n'
const next=source.slice(0,a)+start+nl+'    const CONTOUR_WORKER_SOURCE = '+JSON.stringify(worker)+nl+end+source.slice(b+end.length)
if(process.argv.includes('--check')) {
  if(next!==source)throw Error('Embedded worker is stale; run npm run build:worker')
} else fs.writeFileSync(file,next)
console.log('Contour worker verified: '+worker.length+' characters')

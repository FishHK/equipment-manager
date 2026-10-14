// 開発用プレビュー。業務データを読み書きせず、静的ファイルだけ配信。
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root=path.resolve(__dirname,'..');
http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.setHeader('Cache-Control','no-store');res.end(data);});
}).listen(Number(process.argv[2] || 4173),'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:' + (process.argv[2] || 4173)));

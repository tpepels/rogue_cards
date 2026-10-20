import {createHash,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync,truncateSync,statSync,mkdirSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export function canonicalJSON(value){
  const seen=new Set();
  function normalize(v){
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(typeof v!=='object'||seen.has(v))throw Error('Expected finite, acyclic JSON data');
    if(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('Expected plain JSON data');
    seen.add(v);
    const out=Array.isArray(v)?v.map(normalize):Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));
    seen.delete(v);return out;
  }
  return JSON.stringify(normalize(value));
}
export const hashValue=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
export function atomicWriteJSON(path,value){
  const tmp=path+'.'+randomUUID()+'.tmp';
  let fd;
  try{fd=openSync(tmp,'wx');writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(tmp,path);}
  finally{if(fd!==undefined)closeSync(fd);if(existsSync(tmp))unlinkSync(tmp);}
}

// Hash actual working-tree bytes, including untracked runtime modules. A git HEAD
// alone cannot identify an experimental engine in an uncommitted worktree.
export function sourceFingerprint(){
  const root=fileURLToPath(new URL('../../',import.meta.url)),files=[];
  function walk(path){
    if(!existsSync(path))return;
    if(statSync(path).isDirectory()){
      for(const name of readdirSync(path).sort())if(!['node_modules','.git','target'].includes(name))walk(join(path,name));
    }else files.push({path:relative(root,path),hash:createHash('sha256').update(readFileSync(path)).digest('hex')});
  }
  for(const name of ['src','scripts','native','experiments/agents','experiments/balance-goals.json','package.json','package-lock.json'])walk(resolve(root,name));
  let revision=null;
  try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
  return {schema:'uba-source-v1',revision,node:process.version,platform:process.platform,arch:process.arch,hash:hashValue(files),files};
}

/** Preserve actual dirty source bytes as well as their identity. Historical
 * experiments can be reconstructed even after this checkout changes. */
export function persistSourceSnapshot(out,source){
  const root=fileURLToPath(new URL('../../',import.meta.url)),destination=join(out,'source-snapshot');
  for(const entry of source.files){
    const path=join(destination,entry.path),bytes=readFileSync(existsSync(path)?path:resolve(root,entry.path));
    if(createHash('sha256').update(bytes).digest('hex')!==entry.hash)throw Error('Source snapshot checksum mismatch: '+entry.path);
    if(!existsSync(path)){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx'});}
  }
  atomicWriteJSON(join(destination,'source-manifest.json'),source);
}

export function appendTrialRecord(path,row){
  const record={schema:'uba-trial-record-v1',row,checksum:hashValue(row)},fd=openSync(path,'a');
  try{writeFileSync(fd,JSON.stringify(record)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
}

export function readTrialRecords(path,tasks){
  if(!existsSync(path))return {rows:[],recoveredTail:false};
  const bytes=readFileSync(path),text=bytes.toString('utf8'),lines=text.split('\n'),rows=[],seen=new Set(),planned=new Map(tasks.map(t=>[t.id,t]));
  let offset=0,recoveredTail=false,needsNewline=false;
  for(let i=0;i<lines.length;i++){
    const line=lines[i],last=i===lines.length-1;
    if(last&&!line)break;
    let record;
    try{record=JSON.parse(line);}catch(error){
      // A torn write is recoverable only at EOF and only for an unfinished JSON
      // object. Complete malformed records (including a final newline) are fatal.
      if(last&&line.startsWith('{')&&(/end of JSON|Unterminated string/.test(error.message)||/at position (\d+)/.exec(error.message)?.[1]===String(line.length))){
        truncateSync(path,offset);recoveredTail=true;break;
      }
      throw Error('Corrupt trial record at line '+(i+1),{cause:error});
    }
    if(record?.schema!=='uba-trial-record-v1'||!record.row||record.checksum!==hashValue(record.row))throw Error('Trial checksum/schema mismatch at line '+(i+1));
    const row=record.row,task=planned.get(row.id);
    if(!task)throw Error('Unplanned trial '+row.id);
    if(seen.has(row.id))throw Error('Duplicate trial '+row.id);
    for(const [key,value] of Object.entries(task))if(!Object.hasOwn(row,key)||canonicalJSON(row[key])!==canonicalJSON(value))throw Error('Unplanned trial metadata '+row.id+': '+key);
    if(!['win','death','escape'].includes(row.ending)||![0,1,false,true].includes(row.won)||Boolean(row.won)!==(row.ending==='win'))throw Error('Nonterminal or invalid trial '+row.id);
    seen.add(row.id);rows.push(row);offset+=Buffer.byteLength(line+'\n');
    if(last)needsNewline=true;
  }
  if(needsNewline){const fd=openSync(path,'a');try{writeFileSync(fd,'\n');fsyncSync(fd);}finally{closeSync(fd);}}
  return {rows,recoveredTail};
}

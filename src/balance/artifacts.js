import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {canonicalJSON,contentHash} from './goals.js';

export function writeJSON(path,value){
 mkdirSync(dirname(path),{recursive:true});
 writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');
 renameSync(path+'.tmp',path);
}
export const readJSON=path=>JSON.parse(readFileSync(path,'utf8'));
/** A lock is created before any trials and is never silently changed. */
export function lockConfiguration(path,configuration){
 const value={schema:'uba-configuration-lock-v1',hash:contentHash(configuration),configuration};
 if(existsSync(path)){
  const saved=readJSON(path);
  if(canonicalJSON(saved)!==canonicalJSON(value))throw Error('Incompatible resume configuration: '+path);
 }else writeJSON(path,value);
 return value;
}

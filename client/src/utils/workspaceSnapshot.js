export function beginWorkspaceLoad(previous,key){
  if(previous.key===key&&previous.status==='ready')return previous;
  return previous.key===key?{...previous,status:'loading'}:{key,status:'loading',categories:[],items:[]};
}

export function failWorkspaceLoad(previous,key){
  if(previous.key===key&&previous.status==='ready')return previous;
  return previous.key===key?{...previous,status:'error'}:{key,status:'error',categories:[],items:[]};
}

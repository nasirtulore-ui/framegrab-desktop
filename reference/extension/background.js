importScripts('shared.js');
const JOBS = 'fg_jobs', SETTINGS = 'fg_settings';
let serial = Promise.resolve();
const locked = (fn) => { const result=serial.then(fn,fn); serial=result.catch(()=>{}); return result; };
const storageGet = async () => chrome.storage.local.get([JOBS, SETTINGS]);
async function notify(){ try { await chrome.runtime.sendMessage({type:'CHANGED'}); } catch {} }
async function mutate(fn) {
  return locked(async()=>{ const data=await storageGet(); const jobs=Array.isArray(data[JOBS])?data[JOBS]:[]; const result=await fn(jobs); await chrome.storage.local.set({[JOBS]: jobs.slice(0,300)}); await notify(); return result; });
}
async function runDownload({url, title, subtitleUrl}){
  const kind=FG.classify(url);
  if(kind.kind!=='direct') throw new Error(kind.reason || 'An authorized direct media link is required.');
  if(subtitleUrl && FG.classify(subtitleUrl).kind!=='subtitle') throw new Error('Selected subtitle must be a direct .srt or .vtt file.');
  const data=await storageGet(); const settings={...FG.defaults,...(data[SETTINGS]||{})};
  const name=FG.cleanName(title) || FG.safeFilename(url);
  const extension=kind.ext;
  const finalName=name.toLowerCase().endsWith('.'+extension)?name:`${name}.${extension}`;
  const job={id:crypto.randomUUID(),url,downloadId:null,title:finalName,format:extension.toUpperCase(),quality:'Not verified',subtitle:subtitleUrl?'Subtitle sidecar':'N/A',status:'queued',bytesReceived:0,totalBytes:0,createdAt:Date.now(),error:null};
  await mutate(jobs=>jobs.unshift(job));
  try {
    const downloadId=await chrome.downloads.download({url,filename:finalName,saveAs:true,conflictAction:'uniquify'});
    await mutate(jobs=>{const j=jobs.find(x=>x.id===job.id);if(j){j.downloadId=downloadId;j.status='in_progress';}});const [initial]=await chrome.downloads.search({id:downloadId});if(initial)await updateChromeItem(initial);
    if(subtitleUrl){
      const subExt=FG.classify(subtitleUrl).ext;
      const subName=finalName.replace(/\.[^.]+$/,'')+'.sub.'+subExt;
      const sidecar={id:crypto.randomUUID(),url:subtitleUrl,downloadId:null,title:subName,format:subExt.toUpperCase(),quality:'Subtitle',subtitle:'Provided track',status:'queued',bytesReceived:0,totalBytes:0,createdAt:Date.now(),error:null};
      await mutate(jobs=>jobs.unshift(sidecar));
      try { const sid=await chrome.downloads.download({url:subtitleUrl,filename:subName,saveAs:true,conflictAction:'uniquify'});await mutate(jobs=>{const s=jobs.find(x=>x.id===sidecar.id);if(s){s.downloadId=sid;s.status='in_progress';}});const [initialSub]=await chrome.downloads.search({id:sid});if(initialSub)await updateChromeItem(initialSub); }
      catch(e){await mutate(jobs=>{const s=jobs.find(x=>x.id===sidecar.id);if(s){s.status='interrupted';s.error=e.message;}});}
    }
    return {id:job.id};
  }catch(e){await mutate(jobs=>{const j=jobs.find(x=>x.id===job.id);if(j){j.status='interrupted';j.error=e.message;}});throw e;}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    switch(message.type){
      case 'ADD': return await runDownload(message.payload||{});
      case 'ADD_BATCH': {
        const urls = message.payload?.urls;
        if (!Array.isArray(urls) || !urls.length || urls.length>30) throw new Error('Select 1–30 direct media URLs.');
        const unique=[...new Set(urls)];
        const results=[];
        for(const [i,url] of unique.entries()){
          try{
            const output=await runDownload({url,title:FG.safeFilename(url),subtitleUrl:unique.length===1 ? (message.payload.subtitleUrl||'') : ''});
            results.push({url,ok:true,id:output.id});
          }catch(e){results.push({url,ok:false,error:e.message});}
        }
        return {results};
      }
      case 'PAUSE': await chrome.downloads.pause(message.downloadId);return {ok:true};
      case 'RESUME': await chrome.downloads.resume(message.downloadId);return {ok:true};
      case 'CANCEL': await chrome.downloads.cancel(message.downloadId);return {ok:true};
      case 'RETRY': {
        const data=await storageGet();const job=(data[JOBS]||[]).find(j=>j.id===message.id);
        if(!job) throw new Error('Job not found');
        return await runDownload({url:job.url,title:job.title});
      }
      case 'REMOVE': await mutate(jobs=>{const i=jobs.findIndex(j=>j.id===message.id);if(i>=0)jobs.splice(i,1);});return {ok:true};
      case 'CLEAR_FINISHED': await mutate(jobs=>{for(let i=jobs.length-1;i>=0;i--)if(['complete','cancelled','interrupted'].includes(jobs[i].status))jobs.splice(i,1);});return {ok:true};
      default: throw new Error('Unknown message');
    }
  })().then(x=>respond({ok:true,data:x})).catch(e=>respond({ok:false,error:e?.message||String(e)}));
  return true;
});
async function updateChromeItem(item){
  await mutate(jobs=>{
    const job=jobs.find(j=>j.downloadId===item.id); if(!job)return;
    job.status=item.state==='complete'?'complete':item.state==='interrupted'?'interrupted':item.paused?'paused':'in_progress';
    job.totalBytes=item.totalBytes||0;job.bytesReceived=item.bytesReceived||0;job.error=item.error||null;
  });
}
chrome.downloads.onChanged.addListener(async delta=>{
  try{const [item]=await chrome.downloads.search({id:delta.id});if(item)await updateChromeItem(item);}catch(e){console.warn('FrameGrab change sync',e);}
});
chrome.downloads.onCreated.addListener(async item=>{
  try {await updateChromeItem(item);}catch(e){console.warn('FrameGrab created sync',e);}
});
chrome.runtime.onStartup.addListener(()=>reconcile());
chrome.runtime.onInstalled.addListener(()=>reconcile());
async function reconcile(){
  try{const data=await storageGet();const jobs=data[JOBS]||[];for(const job of jobs){if(job.downloadId!==null&&['queued','in_progress','paused'].includes(job.status)){const [item]=await chrome.downloads.search({id:job.downloadId});if(item)await updateChromeItem(item);}}}catch(e){console.warn('FrameGrab reconciliation',e);}
}

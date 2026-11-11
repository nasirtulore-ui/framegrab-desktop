const $ = id => document.getElementById(id);
const state = { subtitles: [], busy: false, tabId: null, discovered: [] };
const send = (type, payload) => new Promise((resolve,reject)=>chrome.runtime.sendMessage({type,payload},r=>{
  if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
  if(!r?.ok) return reject(new Error(r?.error||'Request failed'));
  resolve(r.data);
}));
const option = (value,label) => { const n=document.createElement('option');n.value=value;n.textContent=label;return n; };
function status(msg,bad=false){const n=$('message');n.textContent=msg;n.className='message '+(bad?'error':'success');}
function rawUrls(){return [...$('videoFields').querySelectorAll('input')].map(e=>e.value.trim()).filter(Boolean);}
function refresh(){
  const list=rawUrls(); const unique=[...new Set(list)];
  $('countLabel').textContent=`${unique.length} ADDED`;
  $('downloadLabel').textContent=unique.length>1?`Download ${unique.length} videos`:'Download';
  $('download').disabled=state.busy||!unique.length;
  const rows=[...$('videoFields').children];rows.forEach((node,i)=>{
    const input=node.querySelector('input'),badge=node.querySelector('.url-status');
    const v=input.value.trim(),k=v?FG.classify(v):null;
    badge.textContent=!v?'Paste a URL':k.kind==='direct'?'Ready':k.kind==='youtube'?'YouTube · restricted':k.reason||'Unsupported';
    badge.className='url-status '+(k?.kind==='direct'?'ok':k?.kind==='youtube'?'warn':'');
    node.querySelector('.remove-url').hidden=rows.length===1;
    node.querySelector('.url-index').textContent=`VIDEO ${String(i+1).padStart(2,'0')}`;
  });
}
function appendField(url='',auto=false){
  const row=document.createElement('div');row.className='video-entry';
  const top=document.createElement('div');top.className='entry-header';
  const number=document.createElement('span');number.className='url-index';
  const note=document.createElement('span');note.className='url-status';
  const rm=document.createElement('button');rm.type='button';rm.className='remove-url';rm.textContent='Remove';rm.setAttribute('aria-label','Remove video');
  rm.addEventListener('click',()=>{row.remove();refresh();});
  top.append(number,note,rm);
  const input=document.createElement('input');input.type='url';input.placeholder='Paste another video URL…';input.autocomplete='off';input.spellcheck=false;input.value=url;
  input.setAttribute('aria-label',auto?'Current page video URL':'Video URL');
  input.addEventListener('input',()=>{
    if(!state.busy && input.value.trim() && row=== $('videoFields').lastElementChild) appendField();
    refresh();
  });
  row.append(top,input);$('videoFields').append(row);refresh();return input;
}
function renderSubs(){
 const el=$('subtitle');el.replaceChildren(option('','N/A — no subtitles'));
 state.subtitles.forEach((v,i)=>el.append(option(String(i),`${v.label||v.lang||'Subtitle'}${v.lang?' ('+v.lang+')':''}`)));
 el.value='';
 $('subtitleHint').textContent=state.subtitles.length?`${state.subtitles.length} direct subtitle track(s) detected on this page. N/A is the default.`:'No supported direct subtitle track on this page. N/A is selected.';
}
function discoverPage(){
  const youtube=/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(location.hostname.toLowerCase());
  if(youtube)return {youtube:true,sources:[],subtitles:[],title:document.title};
  const media=[],subs=[],seen=new Set(),seenSub=new Set();
  function resolved(raw){if(!raw)return null;try{const u=new URL(raw,location.href);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
  function add(raw,label){const u=resolved(raw);if(!u||seen.has(u)||!['direct'].includes(((x)=>{try{return ['mp4','webm','mov','m4v','m4a','mp3','wav','ogg'].includes(new URL(x).pathname.split('.').pop().toLowerCase())?'direct':'other';}catch{return 'other';}})(u)))return;seen.add(u);media.push({url:u,label});}
  function track(raw,label,lang){const u=resolved(raw);if(!u||seenSub.has(u)||!['vtt','srt'].includes(new URL(u).pathname.split('.').pop().toLowerCase()))return;seenSub.add(u);subs.push({url:u,label,lang});}
  add(location.href,'Direct file');
  document.querySelectorAll('video,audio').forEach((v,i)=>{add(v.currentSrc,`Player ${i+1}`);add(v.getAttribute('src'),`Player ${i+1}`);v.querySelectorAll('source').forEach(e=>add(e.getAttribute('src'),`Player ${i+1}`));v.querySelectorAll('track').forEach(t=>track(t.getAttribute('src'),t.label,t.srclang));});
  document.querySelectorAll('a[download]').forEach(a=>add(a.href,a.download||'Direct download'));
  return {youtube:false,sources:media.slice(0,30),subtitles:subs.slice(0,30),title:document.title};
}
async function scan(){
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  state.tabId=tab?.id||null;$('pageTitle').textContent=tab?.title||'Active tab';
  let url=/^https?:/.test(tab?.url||'')?tab.url:'';
  state.subtitles=[];state.discovered=[];
  if(url && tab.id){try{const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:discoverPage});const d=result?.[0]?.result||{};state.subtitles=d.subtitles||[];state.discovered=d.sources||[];if(d.sources?.length)url=d.sources[0].url;}catch(e){console.warn('Page inspection unavailable:',e.message);}}
  const first=$('videoFields').querySelector('input');
  if(first && !first.value)first.value=url;
  $('sourceInfo').textContent=!url?'Open a webpage or paste a supported direct media link.':FG.classify(url).kind==='youtube'?'YouTube URL detected automatically. Downloading its streams is not supported by this extension. You can add authorized direct-media URLs below.':state.discovered.length?'Direct media detected automatically. You can add more videos below.':'Active page URL added automatically; a page URL must be a direct downloadable media file to work.';
  $('sourceInfo').className='helper '+(FG.classify(url).kind==='youtube'?'warn':'');
  renderSubs();refresh();
 }catch(e){$('sourceInfo').textContent='Unable to inspect the tab: '+e.message;refresh();}
}
async function download(){
 const urls=[...new Set(rawUrls())];if(!urls.length)return status('Add at least one video URL.',true);
 const invalid=urls.filter(u=>FG.classify(u).kind!=='direct');
 if(invalid.length){status(`${invalid.length} URL(s) cannot download: ${FG.classify(invalid[0]).reason} Remove or replace them before downloading.`,true);return;}
 state.busy=true;refresh();
 try{
  const selected=$('subtitle').value;
  const subtitleUrl=selected===''?'':state.subtitles[Number(selected)]?.url||'';
  const r=await send('ADD_BATCH',{urls,subtitleUrl:urls.length===1?subtitleUrl:''});
  const good=r.results.filter(x=>x.ok).length;
  status(`${good}/${urls.length} download(s) started. Choose a save folder in each Save As dialog.${urls.length>1&&subtitleUrl?' Subtitles are available only for the detected page video.':''}${r.results.some(x=>!x.ok)?' Some downloads failed; check the queue.':''}`,good===0);
  await recent();
 }catch(e){status(e.message,true);}finally{state.busy=false;refresh();}
}
function node(tag,cls,text){const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;}
async function recent(){const v=await chrome.storage.local.get('fg_jobs');const root=$('recent');root.replaceChildren();const jobs=(v.fg_jobs||[]).slice(0,3);if(!jobs.length){root.append(node('div','empty','No downloads yet. Your queue will appear here.'));return;}
 jobs.forEach(j=>{const c=node('div','recent-item'),ico=node('div','file-icon','↓'),content=node('div','recent-content');content.append(node('strong','ellipsis',j.title),node('span','muted',`${j.format} · ${j.status.replace('_',' ')}`));c.append(ico,content,node('span','percent',j.status==='complete'?'✓':j.totalBytes?Math.round(j.bytesReceived/j.totalBytes*100)+'%':'—'));root.append(c);});}
async function init(){appendField();const d=await chrome.storage.local.get('fg_settings');const s={...FG.defaults,...(d.fg_settings||{})};$('format').value=s.format;$('quality').value=s.quality;await recent();await scan();}
$('addVideo').addEventListener('click',()=>{$('videoFields').lastElementChild?.querySelector('input')?.focus();if($('videoFields').lastElementChild?.querySelector('input')?.value.trim())appendField().focus();});
$('download').addEventListener('click',download);
$('openManager').addEventListener('click',()=>chrome.runtime.openOptionsPage());$('viewQueue').addEventListener('click',()=>chrome.runtime.openOptionsPage());
for(const id of ['quality','format'])$(id).addEventListener('change',async()=>{const d=await chrome.storage.local.get('fg_settings');await chrome.storage.local.set({fg_settings:{...(d.fg_settings||{}),format:$('format').value,quality:$('quality').value,subtitles:'na',subtitleEnabled:false,askWhere:true}});});
chrome.storage.onChanged.addListener(changes=>{if(changes.fg_jobs)recent();});
init().catch(e=>status(e.message,true));
